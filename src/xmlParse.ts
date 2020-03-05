import * as xml2js from 'xml2js';
import * as _ from 'lodash';
import { RegionAttributes, RegionsObject, RootLayout, SMILVideo, SMILFileObject, SMILPlaylist } from './models';
import { SMILEnemus } from './enums';
import got from 'got';

function flatten(arr) {
    return arr.reduce(function (flat, toFlatten) {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

// export async function downloadFile(filePath: string): Promise<string> {
//     console.log('parsing file');
//     const response = await got(filePath);
//     const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
//     const localPath = `./SMIL/${fileName}`;
//     await fsPromise.writeFile(localPath, response.body, 'utf8');
//     return localPath;
// }

async function parseXml(xmlFile: string): Promise<SMILFileObject> {
    // const xmlFile: string = await fsPromise.readFile(filePath, 'utf8');
    const xmlObject: any = await xml2js.parseStringPromise(xmlFile, {
        mergeAttrs: true,
        explicitArray: false,
    });

    const regions = <RegionsObject>extractRegionInfo(xmlObject.smil.head.layout);
    const videos = <SMILPlaylist>extractBodyContent(xmlObject.smil.body);
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
    if (!_.isEmpty(picked)) {
        arr.push([picked[element]]);
    }
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

        // if (!_.isEmpty(object)) {
        //     picked[key] = object;
        // }

    });
    // return picked;
    return arr;
}

function extractBodyContent(xmlObject: object): SMILPlaylist {
    const playlist: SMILPlaylist = {
      videos: [],
    };
    const videoArr = [];
    const audioArr = [];
    playlist.videos = <SMILVideo[]>flatten(pickDeep(xmlObject, 'video', videoArr));
    // const audios = pickDeep(xmlObject, ['audio'], audioArr);
    return playlist;
}

export async function processSmil(localFilePath: string) {
    console.log(localFilePath);
    console.log('test');
    // const smilObject = await parseXml(localFilePath);
    // return smilObject;
}

// processSmil('http://butikstv.centrumkanalen.com/play/smil/234.smil');
