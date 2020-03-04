const xml2js = require('xml2js');
import { promises as fsPromise } from 'fs';
import * as _ from 'lodash';
import { RegionAttributes, RegionsObject, RootLayout, SMILVideo, SMILPlaylist } from './models';
import { SMILEnemus } from './enums';

async function parseXml(filePath: string) {
    const xmlFile: string = await fsPromise.readFile(filePath, 'utf8');
    const xmlObject: any = await xml2js.parseStringPromise(xmlFile, {
        mergeAttrs: true,
        explicitArray: false,
    });

    const parsedRegionObject = extractRegionInfo(xmlObject.smil.head.layout);
    const parsedBody = extractBodyContent(xmlObject.smil.body);
    console.log('...');
}

function extractRegionInfo(xmlObject: object): object {
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

function pickDeep(collection, identity) {
    const picked = _.pick(collection, identity);
    const collections = _.pickBy(collection, _.isObject);

    _.each(collections, function(item, key, collection) {
        let object;
        if (Array.isArray(item)) {
            object = _.reduce(item, function(result, value) {
                const picked = pickDeep(value, identity);
                if (!_.isEmpty(picked)) {
                    result.push(picked);
                }
                return result;
            }, []);
        } else {
            object = pickDeep(item, identity);
        }

        if (!_.isEmpty(object)) {
            picked[key] = object;
        }

    });

    return picked;
}

function extractBodyContent(xmlObject: object): object {
    const videos = pickDeep(xmlObject, ['video', 'audio']);
    return videos;
}

function processXmlObject(xmlObject: object): object {
    return {};
}

parseXml('./SMIL/234.smil');
// parseXml('./SMIL/99.smil');
