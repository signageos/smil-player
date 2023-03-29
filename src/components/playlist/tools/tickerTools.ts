import { debug } from './generalTools';
import { SMILTicker } from '../../../models/mediaModels';
import { XmlTags } from '../../../enums/xmlEnums';
import { HtmlEnum } from '../../../enums/htmlEnums';
import { RegionAttributes } from '../../../models/xmlJsonModels';
import { CssElementsPosition } from '../../../models/htmlModels';

const DEFAULT_SPACE_BETWEEN_TEXTS = 100;
const DEFAULT_SPEED_PX_PER_SEC = 100;
const DEFAULT_WRAPPER_HEIGHT_TO_FONT_SIZE_RATIO = 0.6;

const getFontFamilyLinkHref = (fontFamily: string) => `https://fonts.googleapis.com/css?family=${fontFamily}`;

function linkFontFamily(fontFamily: string) {
	const isFontLinked = document.querySelectorAll(`style[id='font_${fontFamily}']`).length > 0;
	if (!isFontLinked) {
		const url = getFontFamilyLinkHref(fontFamily);
		const styleElement = document.createElement(HtmlEnum.style);
		styleElement.setAttribute('type', 'text/css');
		styleElement.setAttribute('ref', 'stylesheet');
		styleElement.setAttribute('id', `font_${fontFamily}`);
		styleElement.innerHTML = `@import url("${url}");`;
		document.head.appendChild(styleElement);
	}
}

export function createTickerElement(ticker: SMILTicker, regionInfo: RegionAttributes, key: string): string {
	const elementId = `ticker-${ticker.regionInfo.regionName}-${key}`;
	debug('creating element: %s' + elementId);
	if (document.getElementById(elementId)) {
		debug('element already exists: %s' + elementId);
		return elementId;
	}

	const element: HTMLElement = document.createElement(HtmlEnum.div);
	element.id = elementId;

	Object.keys(regionInfo).forEach((attr: string) => {
		if (XmlTags.cssElementsPosition.includes(attr)) {
			element.style[attr as keyof CssElementsPosition] = `${regionInfo[attr]}px`;
		}
		if (XmlTags.cssElements.includes(attr)) {
			element.style[attr as keyof CssElementsPosition] = regionInfo[attr];
		}
	});

	if (typeof ticker.linearGradient === 'string') {
		const linearGradientAngle = Number.parseInt(String(ticker.linearGradientAngle));
		const linearGradientDeg = Number.isInteger(linearGradientAngle) ? linearGradientAngle : 0;
		element.style.backgroundImage = `linear-gradient(${linearGradientDeg}deg, ${ticker.linearGradient})`;
	} else if (typeof ticker.backgroundColor === 'string') {
		element.style.backgroundColor = ticker.backgroundColor;
	}

	if (typeof ticker.fontColor === 'string') {
		element.style.color = ticker.fontColor;
	}
	if (typeof ticker.fontName === 'string') {
		const fontName = ticker.fontName.includes('-') ? ticker.fontName.split('-')[0] : ticker.fontName;
		linkFontFamily(fontName);
		element.style.fontFamily = fontName;
		if (ticker.fontName.endsWith('Bold')) {
			element.style.fontWeight = 'bold';
		}
	}
	const fontSizeOrNaN = Number.parseInt(String(ticker.fontSize), 10);

	element.style.position = 'absolute';
	element.style.overflow = 'hidden';
	element.style.whiteSpace = 'nowrap';
	element.style.borderWidth = '0px';

	element.style.visibility = 'hidden';
	document.body.appendChild(element);

	const fontSize = Number.isInteger(fontSizeOrNaN)
		? `${fontSizeOrNaN}px`
		: `${Math.round(element.clientHeight * DEFAULT_WRAPPER_HEIGHT_TO_FONT_SIZE_RATIO)}px`;
	element.style.lineHeight = fontSize;
	element.style.fontSize = fontSize;

	return element.id;
}

type TextChild = { element: HTMLSpanElement; left: number; width: number };

export function startTickerAnimation(wrapperElement: HTMLElement, ticker: SMILTicker) {
	const texts = Array.isArray(ticker.text) ? ticker.text : [ticker.text];
	const fontSizeOrNaN = Number.parseInt(String(ticker.fontSize), 10);
	const fontSize = Number.isInteger(fontSizeOrNaN)
		? fontSizeOrNaN
		: Math.round(wrapperElement.clientHeight * DEFAULT_WRAPPER_HEIGHT_TO_FONT_SIZE_RATIO);
	const indentation = Number.parseInt(String(ticker.indentation), 10);
	const spaceBetweenTexts = Number.isInteger(indentation) ? indentation : DEFAULT_SPACE_BETWEEN_TEXTS;
	const velocity = Number.parseInt(String(ticker.velocity), 10);
	const speedPxPerSec = Number.isInteger(velocity) ? velocity : DEFAULT_SPEED_PX_PER_SEC;

	let lastChildRightEdgeLeft = wrapperElement.clientWidth;
	let textChildren = texts.map((text: string, index: number): TextChild => {
		const left = lastChildRightEdgeLeft;
		const textChildElement = document.createElement(HtmlEnum.span);

		textChildElement.setAttribute('id', `${ticker.id}_text${index}`);
		textChildElement.style.position = 'absolute';
		textChildElement.style.top = `${Math.round(wrapperElement.clientHeight / 2 - fontSize / 2)}px`;
		textChildElement.style.left = `${left}px`;
		textChildElement.style.transition = 'left 1s linear';
		textChildElement.innerText = text;

		wrapperElement.appendChild(textChildElement);
		lastChildRightEdgeLeft += textChildElement.clientWidth + indentation;
		return { element: textChildElement, left, width: textChildElement.clientWidth };
	});

	const tickerTick = () => {
		lastChildRightEdgeLeft -= speedPxPerSec;
		textChildren = textChildren.map((textChild: TextChild) => {
			let left = textChild.left;
			const isBehindLeftEdge = textChild.left + textChild.width < 0;

			if (isBehindLeftEdge) {
				left = Math.max(lastChildRightEdgeLeft, wrapperElement.clientWidth);
				lastChildRightEdgeLeft = left + textChild.width + spaceBetweenTexts;
				textChild.element.style.transition = '';
			} else {
				left -= speedPxPerSec;
				textChild.element.style.transition = 'left 1s linear';
			}

			textChild.element.style.left = `${left}px`;
			return { ...textChild, left };
		});
		ticker.timeoutReference = setTimeout(tickerTick, 1e3);
	};

	wrapperElement.style.visibility = 'visible';
	tickerTick();
}

export function stopTickerAnimation(ticker: SMILTicker) {
	if (ticker.timeoutReference) {
		clearTimeout(ticker.timeoutReference);
		ticker.timeoutReference = undefined;
	}
	const wrapperElement = document.getElementById(ticker.id ?? '');
	if (wrapperElement) {
		wrapperElement.style.visibility = 'hidden';
		wrapperElement.innerText = '';
	}
}
