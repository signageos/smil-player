import get = require('lodash/get');
import isNil = require('lodash/isNil');

import { RegionAttributes } from '../../../models/xmlJsonModels';
import { debug, generateElementId } from './generalTools';
import { XmlTags } from '../../../enums/xmlEnums';
import { ObjectFitEnum } from '../../../enums/htmlEnums';
import { SMILImage, SMILWidget } from '../../../models/mediaModels';

export function createHtmlElement(
	htmlElement: string, filepath: string, regionInfo: RegionAttributes, key: string, isTrigger: boolean = false,
): HTMLElement {
	const element: HTMLElement = document.createElement(htmlElement);

	element.id = generateElementId(filepath, regionInfo.regionName, key);
	Object.keys(regionInfo).forEach((attr: any) => {
		if (XmlTags.cssElementsPosition.includes(attr)) {
			element.style[attr] = `${regionInfo[attr]}px`;
		}
		if (XmlTags.cssElements.includes(attr)) {
			element.style[attr] = <string> regionInfo[attr];
		}
		if (XmlTags.additionalCssExtract.includes(attr)) {
			element.style[<any> ObjectFitEnum.objectFit] = get(ObjectFitEnum, `${regionInfo[attr]}`, 'fill');
		}
	});
	element.style.position = 'absolute';
	element.style.backgroundColor = 'transparent';
	element.style.borderWidth = '0px';

	element.style.visibility = 'hidden';
	// set filePAth for trigger images immediately
	if (isTrigger) {
		element.setAttribute('src', filepath);
	}

	return element;
}

/**
 * Creates DOM elements for all images and widgets in playlist ( without src, just placeholders )
 * @param value - Smil image or Smil widget
 * @param htmlElement - which htmlElement should be created in DOM ( img or iframe )
 * @param isTrigger - determines if element is trigger element or ordinary one ( trigger is played on demand )
 */
export function createDomElement(value: SMILImage | SMILWidget, htmlElement: string, key: string, isTrigger: boolean = false): string {
	const elementId = generateElementId(value.localFilePath, value.regionInfo.regionName, key);
	debug('creating element: %s' + elementId);
	if (document.getElementById(elementId)) {
		debug('element already exists: %s' + elementId);
		return elementId;
	}
	const localFilePath = value.localFilePath !== '' ? value.localFilePath : value.src;
	const element = createHtmlElement(htmlElement, localFilePath, value.regionInfo, key, isTrigger);
	document.body.appendChild(element);
	return element.id;
}

export function resetBodyContent() {
	try {
		for (let i = document.images.length; i-- > 0;) {
			debug('Removing images');
			if (!isNil(document.images[i])) {
				document.images[i].parentNode!.removeChild(document.images[i]);
			}
		}
	} catch (err) {
		debug('Error: %O during removing image: %O', err, document.images[document.images.length]);
	}

	// reset body
	document.body.innerHTML = '';
	document.body.style.backgroundColor = 'transparent';
	document.body.style.margin = '0px';
}
