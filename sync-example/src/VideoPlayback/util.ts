export function wait(timeout: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, timeout);
	});
}

export function generateRandomString(length: number) {
	const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return result;
}

export type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
};

export const makeDeferred = <T>(): Deferred<T> => {
	const deferred: any = {};
	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});
	return deferred;
}
