import { Log } from '../../../logger';
import { SMILTicker } from '../../../models/mediaModels';
import { XmlTags } from '../../../enums/xmlEnums';
import { HtmlEnum } from '../../../enums/htmlEnums';
import { RegionAttributes } from '../../../models/xmlJsonModels';
import { CssElementsPosition } from '../../../models/htmlModels';

const DEFAULT_SPACE_BETWEEN_TEXTS = 100;
const DEFAULT_SPEED_PX_PER_SEC = 100;
const DEFAULT_WRAPPER_HEIGHT_TO_FONT_SIZE_RATIO = 0.6;

/**
 * Resolve the ticker font size in px: an explicit numeric `fontSize` wins,
 * otherwise fall back to a fixed ratio of the wrapper height. A malformed
 * value (undefined / "auto" / "") parses to NaN and takes the fallback.
 */
export function resolveTickerFontSize(rawFontSize: string | undefined, clientHeight: number): number {
	const fontSizeOrNaN = Number.parseInt(String(rawFontSize), 10);
	return Number.isInteger(fontSizeOrNaN)
		? fontSizeOrNaN
		: Math.round(clientHeight * DEFAULT_WRAPPER_HEIGHT_TO_FONT_SIZE_RATIO);
}

/**
 * Gap in px placed after each text. A malformed `indentation` (NaN) would
 * poison every subsequent text child's starting position, so it falls back to
 * a sane default.
 */
export function resolveSpaceBetweenTexts(rawIndentation: string | undefined): number {
	const indentation = Number.parseInt(String(rawIndentation), 10);
	return Number.isInteger(indentation) ? indentation : DEFAULT_SPACE_BETWEEN_TEXTS;
}

/** Scroll speed in px/sec; a malformed `velocity` (NaN) falls back to a default. */
export function resolveSpeedPxPerSec(rawVelocity: string | undefined): number {
	const velocity = Number.parseInt(String(rawVelocity), 10);
	return Number.isInteger(velocity) ? velocity : DEFAULT_SPEED_PX_PER_SEC;
}

/** Vertical centering of a text line of `fontSize` within a `clientHeight` wrapper. */
export function computeTickerTextTop(clientHeight: number, fontSize: number): number {
	return Math.round(clientHeight / 2 - fontSize / 2);
}

/** A text child is behind the left edge (and must recycle) once its right edge crosses 0. */
export function isTextBehindLeftEdge(left: number, width: number): boolean {
	return left + width < 0;
}

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

export function createTickerTools(log: Log) {
	function createTickerElement(ticker: SMILTicker, regionInfo: RegionAttributes, key: string): string {
		const elementId = `ticker-${ticker.regionInfo.regionName}-${key}`;
		log.debug('[ticker] creating element: id=%s', elementId);
		if (document.getElementById(elementId)) {
			log.debug('[ticker] reusing existing element: id=%s', elementId);
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
		element.style.position = 'absolute';
		element.style.overflow = 'hidden';
		element.style.whiteSpace = 'nowrap';
		element.style.borderWidth = '0px';

		element.style.visibility = 'hidden';
		document.body.appendChild(element);

		const fontSize = `${resolveTickerFontSize(ticker.fontSize, element.clientHeight)}px`;
		element.style.lineHeight = fontSize;
		element.style.fontSize = fontSize;

		return element.id;
	}

	return { createTickerElement };
}
export type TickerTools = ReturnType<typeof createTickerTools>;

type TextChild = { element: HTMLSpanElement; left: number; width: number };

export function startTickerAnimation(wrapperElement: HTMLElement, ticker: SMILTicker) {
	// Idempotent start: if this ticker is already animating (e.g. the
	// playlistProcessor guard at playlistProcessor.ts ~780 misses a state
	// change and invokes us twice on the same ticker object), detach the
	// prior setTimeout chain and drop its orphan text <span> children
	// before building a fresh one. Without this the old chain keeps
	// scheduling itself forever from its closed-over state and the old
	// spans linger in the DOM — a slow memory + CPU leak.
	stopTickerAnimation(ticker);

	const texts = Array.isArray(ticker.text) ? ticker.text : [ticker.text];
	const fontSize = resolveTickerFontSize(ticker.fontSize, wrapperElement.clientHeight);
	const spaceBetweenTexts = resolveSpaceBetweenTexts(ticker.indentation);
	const speedPxPerSec = resolveSpeedPxPerSec(ticker.velocity);

	let lastChildRightEdgeLeft = wrapperElement.clientWidth;
	let textChildren = texts.map((text: string, index: number): TextChild => {
		const left = lastChildRightEdgeLeft;
		const textChildElement = document.createElement(HtmlEnum.span);

		textChildElement.setAttribute('id', `${ticker.id}_text${index}`);
		textChildElement.style.position = 'absolute';
		textChildElement.style.top = `${computeTickerTextTop(wrapperElement.clientHeight, fontSize)}px`;
		textChildElement.style.left = `${left}px`;
		textChildElement.style.transition = 'left 1s linear';
		textChildElement.innerText = text;

		wrapperElement.appendChild(textChildElement);
		// spaceBetweenTexts is the sanitized indentation (see resolveSpaceBetweenTexts):
		// a raw malformed indentation is NaN and `lastChildRightEdgeLeft += NaN`
		// would poison every subsequent text child's starting position. The per-tick
		// wrap path below uses spaceBetweenTexts for the same reason.
		lastChildRightEdgeLeft += textChildElement.clientWidth + spaceBetweenTexts;
		return { element: textChildElement, left, width: textChildElement.clientWidth };
	});

	const tickerTick = () => {
		lastChildRightEdgeLeft -= speedPxPerSec;
		textChildren = textChildren.map((textChild: TextChild) => {
			let left = textChild.left;
			const isBehindLeftEdge = isTextBehindLeftEdge(textChild.left, textChild.width);

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
