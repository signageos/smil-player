
/**
 * Parse specific format of duration of RFC 5545 into milliseconds.
 * Example: P15DT5H0M20S -> 15 days, 5 hours, and 20 seconds
 * Specs https://icalendar.org/iCalendar-RFC-5545/3-3-6-duration.html
 */
export function parseRFC5545Duration(duration: string): number {
	const [dateDur, timeDur] = duration.split('T');
	const dateMatches = dateDur.match(/P((\d+)D)?((\d+)W)?/);
	const timeMatches = timeDur?.match(/((\d+)H)?((\d+)M)?((\d+)S)?/);
	const days = dateMatches?.[2] ? parseInt(dateMatches[2]) : 0;
	const weeks = dateMatches?.[4] ? parseInt(dateMatches[4]) : 0;
	const hours = timeMatches?.[2] ? parseInt(timeMatches[2]) : 0;
	const minutes = timeMatches?.[4] ? parseInt(timeMatches[4]) : 0;
	const seconds = timeMatches?.[6] ? parseInt(timeMatches[6]) : 0;
	return 1e3 * (
		seconds
		+ 60 * (
			minutes
			+ 60 * (
				hours
				+ 24 * (
					days
					+ 7 * weeks
				)
			)
		)
	);
}
