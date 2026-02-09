import * as chai from 'chai';
import { getDynamicTagsFromPlaylist } from '../../../src/components/playlist/tools/dynamicPlaylistTools';

const expect = chai.expect;

describe('dynamicPlaylistTools', () => {
	describe('getDynamicTagsFromPlaylist', () => {
		it('Should extract emitDynamic data values', () => {
			const playlist: any = {
				seq: {
					emitDynamic: { data: 'dynamic-tag-1' },
					video: { src: 'video.mp4' },
				},
			};
			const result = getDynamicTagsFromPlaylist(playlist);
			expect(result).to.deep.equal(['dynamic-tag-1']);
		});

		it('Should extract EXPERIMENTAL_emitDynamic (legacy) data values', () => {
			const playlist: any = {
				par: {
					EXPERIMENTAL_emitDynamic: { data: 'legacy-tag' },
				},
			};
			const result = getDynamicTagsFromPlaylist(playlist);
			expect(result).to.deep.equal(['legacy-tag']);
		});

		it('Should return empty array when no dynamic tags', () => {
			const playlist: any = {
				seq: {
					video: { src: 'video.mp4' },
					img: { src: 'image.png' },
				},
			};
			const result = getDynamicTagsFromPlaylist(playlist);
			expect(result).to.deep.equal([]);
		});

		it('Should handle nested playlist structures', () => {
			const playlist: any = {
				par: {
					seq: {
						emitDynamic: { data: 'nested-tag-1' },
						par: {
							emitDynamic: { data: 'nested-tag-2' },
						},
					},
					EXPERIMENTAL_emitDynamic: { data: 'top-level-legacy' },
				},
			};
			const result = getDynamicTagsFromPlaylist(playlist);
			expect(result).to.include('nested-tag-1');
			expect(result).to.include('nested-tag-2');
			expect(result).to.include('top-level-legacy');
			expect(result).to.have.lengthOf(3);
		});
	});
});
