import get = require('lodash/get');
import set = require('lodash/set');
import isNil = require('lodash/isNil');
import isObject = require('lodash/isObject');

import { RegionAttributes } from '../../../models/xmlJsonModels';
import { debug, generateElementId, removeDigits } from './generalTools';
import { XmlTags } from '../../../enums/xmlEnums';
import { HtmlEnum, ObjectFitEnum } from '../../../enums/htmlEnums';
import { SMILImage, SMILWidget } from '../../../models/mediaModels';
import { PlaylistElement } from '../../../models/playlistModels';
import { SMILTriggersEnum } from '../../../enums/triggerEnums';
import { ParsedTriggerCondition } from '../../../models/triggerModels';
import { SMILFileObject } from '../../../models/filesModels';

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
 * @param key - tag of media in xml ( img, video etc...)
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

export function setTransitionsDefinition(smilObject: SMILFileObject) {
	if (Object.keys(smilObject.transition).length > 0 && isNil(document.getElementById(HtmlEnum.transitionStyleId))) {
		const css = `@keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-moz-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-webkit-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-o-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			  }
			}

			@-ms-keyframes fadeOut {
			  0% {
				opacity:1;
			  }
			  100% {
				opacity:0;
			}`;

		const style = <any> document.createElement('style');
		style.id = HtmlEnum.transitionStyleId;
		if (style.styleSheet) {
			style.styleSheet.cssText = css;
		} else {
			style.appendChild(document.createTextNode(css));
		}

		document.getElementsByTagName('head')[0].appendChild(style);
	}
}

export function setTransitionCss(element: HTMLElement, id: string, transitionDuration: number) {
	const nextElement = <HTMLElement> document.getElementById(<string> id);
	const transitionString = `fadeOut ease ${transitionDuration}ms forwards`;

	nextElement.style.setProperty('visibility', 'visible');

	element.style.setProperty('animation', transitionString);
	element.style.setProperty('-webkit-animation', transitionString);
	element.style.setProperty('-moz-animation', transitionString);
	element.style.setProperty('-o-animation', transitionString);
	element.style.setProperty('-ms-animation', transitionString);
	element.style.setProperty('-webkit-backface-visibility', 'hidden');
}

export function removeTransitionCss(element: HTMLElement) {
	element.style.removeProperty('animation');
	element.style.removeProperty('-webkit-animation');
	element.style.removeProperty('-moz-animation');
	element.style.removeProperty('-o-animation');
	element.style.removeProperty('-ms-animation');
	element.style.removeProperty('-webkit-backface-visibility');
}

export function addEventOnTriggerWidget(
	elem: PlaylistElement, triggerEndless: any,
	triggerInfo: { condition: ParsedTriggerCondition[], stringCondition: string, trigger: string },
	): void {
	for (let [key, value] of Object.entries(elem)) {
		if (removeDigits(key) === 'ref') {
			setupIframeEventListeners(get(value, 'id'), triggerEndless, triggerInfo);
		}
		if (isObject(value)) {
			return addEventOnTriggerWidget(<any> value, triggerEndless, triggerInfo);
		}
	}
}

function setupIframeEventListeners(
	iframeId: string, triggerEndless: any, triggerInfo: { condition: ParsedTriggerCondition[], stringCondition: string, trigger: string },
	) {
	const iframe: any = document.getElementById(iframeId);
	let iDoc = iframe.contentWindow || iframe.contentDocument;
	if (iDoc.document) {
		iDoc = iDoc.document;
		iDoc.body.addEventListener(SMILTriggersEnum.mouseEventType, async () => {
			set(triggerEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());
		});

		iDoc.body.addEventListener(SMILTriggersEnum.touchEventType, async () => {
			set(triggerEndless, `${triggerInfo.trigger}.latestEventFired`, Date.now());
		});
	}
}
