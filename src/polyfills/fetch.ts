export function applyFetchPolyfill() {
	const nativeFetch: ((input: RequestInfo, init?: RequestInit) => Promise<Response>) | undefined = window.fetch;
	// @ts-ignore
	delete window.fetch;
	require('whatwg-fetch');
	const whatwgFetch = window.fetch;
	window.fetch = function (input: RequestInfo, init?: RequestInit) {
		const url = typeof input === 'string' ? input : input.url;
		if (isWebkitFileSystemUri(url)) {
			return whatwgFetch(input, init);
		}
		const availableFetch = nativeFetch ?? whatwgFetch;
		return availableFetch(input, init);
	};
}

function isWebkitFileSystemUri(uri: string) {
	return uri.startsWith('filesystem:');
}
