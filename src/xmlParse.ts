import * as xml2js from 'xml2js';
import * as _ from 'lodash';
import { promises as fsPromise } from 'fs';
import {
    RegionAttributes,
    RegionsObject,
    RootLayout,
    SMILVideo,
    SMILFileObject,
    SMILPlaylist,
    SMILAudio, SMILImage, SMILWidget
} from './models';
import { SMILEnemus } from './enums';
import { JefNode } from 'json-easy-filter';
import * as deepmerge from 'deepmerge';
import got from 'got';

const extractedElements = ['video', 'audio', 'img', 'ref'];
const flowElements = ['seq', 'par'];

export async function sleep (ms: number){
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function flatten(arr) {
    return arr.reduce(function (flat, toFlatten) {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

function mergeArrays(...arrays) {
    let jointArray = [];

    arrays.forEach(array => {
        jointArray = [...jointArray, ...array]
    });
    return Array.from(new Set([...jointArray]))
}

function removeDuplicates(array) {
    return Array.from(new Set([...array]))
}

const overwriteMerge = (destinationArray, sourceArray, options) => sourceArray;

function mergeObjects(array) {
    return deepmerge.all(array, { arrayMerge: overwriteMerge });
    // const finalObject = {};
    // array.forEach((arr) => {
    //     _.merge(finalObject, arr);
    // });
    //
    // return finalObject;
}

export function getFileName(filePath: string){
    return filePath.substring(filePath.lastIndexOf('/') + 1);
}

// export async function downloadFile(filePath: string): Promise<string> {
//     console.log('parsing file');
//     const response = await got(filePath);
//     const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
//     const localPath = `./SMIL/${fileName}`;
//     await fsPromise.writeFile(localPath, response.body, 'utf8');
//     return localPath;
// }

async function parseXml(filePath: string): Promise<SMILFileObject> {
    const xmlFile: string = await fsPromise.readFile(filePath, 'utf8');
    const xmlObject: any = await xml2js.parseStringPromise(xmlFile, {
        mergeAttrs: true,
        explicitArray: false,
    });

    const videos = <SMILPlaylist>extractBodyContent(xmlObject.smil.body);

    const testing = new JefNode(videos).filter(function(node) {
        if (extractedElements.includes(node.key) && flowElements.includes(node.parent.key)) {
            let extractedNode = node.parent;
            if (flowElements.includes(node.parent.parent.key)) {
                extractedNode = node.parent.parent;
            }
            if (!_.isNaN(parseInt(node.parent.parent.key))) {
                extractedNode = node.parent.parent.parent;
            }
            const key = extractedNode.key;
            const value = extractedNode.value;
            const returnObject = {};
            returnObject[key] = value;
            return returnObject;
        }
    });

    const merged = mergeObjects(testing);
    console.log(testing);

    const regions = <RegionsObject>extractRegionInfo(xmlObject.smil.head.layout);

    const smilFileObject: SMILFileObject = Object.assign({}, regions, videos);
    return smilFileObject;
}

function extractRegionInfo(xmlObject: object): RegionsObject {
    const regionsObject: RegionsObject = {
        region: {},
    };
    Object.keys(xmlObject).forEach((rootKey) => {
        // multiple regions in layout element
        if (Array.isArray(xmlObject[rootKey])) {
            // iterate over array of objects
            Object.keys(xmlObject[rootKey]).forEach((index) => {
                //creates structure like this
                // {
                //     "region": {
                //         "video": {
                //             "regionName": "video",
                //                 "left": "0",
                //                 "top": "0",
                //                 "width": "1080",
                //                 "height": "1920",
                //                 "z-index": "1",
                //                 "backgroundColor": "#FFFFFF",
                //                 "mediaAlign": "center"
                //         },
                //         "custom": {
                //             "regionName": "custom",
                //                 "left": "0",
                //                 "top": "0",
                //                 "width": "1080",
                //                 "height": "1920",
                //                 "z-index": "1",
                //                 "backgroundColor": "#FFFFFF",
                //                 "mediaAlign": "center"
                //         }
                //     }
                // }
                regionsObject.region[xmlObject[rootKey][index].regionName] = <RegionAttributes>xmlObject[rootKey][index];
            });
        } else {
            // only one region/root-layout in layout element
            if (rootKey === SMILEnemus.rootLayout){
                regionsObject[rootKey] = <RootLayout>xmlObject[rootKey];
            }

            if (rootKey === SMILEnemus.region){
                regionsObject.region[xmlObject[rootKey].regionName] = <RegionAttributes>xmlObject[rootKey];
            }
        }
    });

    return regionsObject;
}

function pickDeep(collection, element, arr) {
    const picked = _.pick(collection, element);
    // if (!_.isEmpty(picked)) {
    //     arr.push([picked[element]]);
    // }
    const collections = _.pickBy(collection, _.isObject);

    _.each(collections, function(item, key, collection) {
        let object;
        if (Array.isArray(item)) {
            object = _.reduce(item, function(result, value) {
                const picked = pickDeep(value, element, arr);
                if (!_.isEmpty(picked)) {
                    result.push(picked);
                }
                return result;
            }, []);
        } else {
            object = pickDeep(item, element, arr);
        }

        if (!_.isEmpty(object)) {
            picked[key] = object;
        }

    });
    return picked;
    // return arr;
}

function extractBodyContent(xmlObject: object): SMILPlaylist {
    const playlist: SMILPlaylist = {
        videos: [],
        audios: [],
        images: [],
        widgets: [],
    };
    const videoArr = [];
    const audioArr = [];
    const imageArr = [];
    const widgetArr = [];
    // playlist.videos = <SMILVideo[]>flatten(pickDeep(xmlObject, 'video', videoArr));
    playlist.videos = <SMILVideo[]>pickDeep(xmlObject, ['video', 'audio', 'img', 'ref'], videoArr);
    // playlist.audios = <SMILAudio[]>flatten(pickDeep(xmlObject, 'audio', audioArr));
    // playlist.images = <SMILImage[]>flatten(pickDeep(xmlObject, 'img', imageArr));
    // playlist.widgets = <SMILWidget[]>flatten(pickDeep(xmlObject, 'ref', widgetArr));
    return playlist;
}

export async function processSmil(xmlFile: string) {
    const smilObject = await parseXml('./SMIL/234.smil');
    return smilObject;
}

processSmil('');
