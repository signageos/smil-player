import { debug } from '../tools/generalTools';
import { PlaylistElement } from '../../../models/playlistModels';

export interface ElementRegistryEntry {
	element: PlaylistElement;
	regionName: string;
	syncIndex: number;
	parentRef: WeakRef<any>;
	parentKey: string;
	navigationPath: string[];
	contextInfo: {
		currentIndex?: number;
		siblingCount?: number;
		depth: number;
	};
}

export class ElementRegistry {
	private registry = new Map<string, ElementRegistryEntry>();
	private regionElements = new Map<string, ElementRegistryEntry[]>();

	public addElement(entry: ElementRegistryEntry): void {
		const key = `${entry.regionName}-${entry.syncIndex}`;
		debug('Adding element to registry: %s', key);
		
		this.registry.set(key, entry);
		
		if (!this.regionElements.has(entry.regionName)) {
			this.regionElements.set(entry.regionName, []);
		}
		this.regionElements.get(entry.regionName)!.push(entry);
	}

	public getElementBySyncIndex(regionName: string, syncIndex: number): ElementRegistryEntry | undefined {
		const key = `${regionName}-${syncIndex}`;
		return this.registry.get(key);
	}

	public getRegionElements(regionName: string): ElementRegistryEntry[] {
		return this.regionElements.get(regionName) || [];
	}

	public getNextElement(regionName: string, currentSyncIndex: number): ElementRegistryEntry | undefined {
		const elements = this.getRegionElements(regionName);
		const sortedElements = elements.sort((a, b) => a.syncIndex - b.syncIndex);
		
		for (const element of sortedElements) {
			if (element.syncIndex > currentSyncIndex) {
				return element;
			}
		}
		
		return undefined;
	}

	public clear(): void {
		debug('Clearing element registry');
		this.registry.clear();
		this.regionElements.clear();
	}

	public size(): number {
		return this.registry.size;
	}
}