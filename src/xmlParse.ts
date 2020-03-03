const xml2js = require('xml2js');
import { promises as fsPromise } from 'fs';
import {RegionAttributes, RegionsObject, RootLayout} from './models';
import { SMILEnemus } from './enums';

async function parseXml(filePath: string) {
    const xmlFile: string = await fsPromise.readFile(filePath, 'utf8');
    const xmlObject: object = await xml2js.parseStringPromise(xmlFile, {
        mergeAttrs: true,
        explicitArray: false,
    });

    const parsedRegionObject = extractRegionInfo(xmlObject['smil'].head.layout);
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

function processXmlObject(xmlObject: object): object {
    return {};
}

parseXml('./SMIL/234.smil');
