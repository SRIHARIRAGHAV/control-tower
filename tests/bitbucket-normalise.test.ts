import { describe, expect, it } from 'vitest';
import { mapBitbucketCommits } from '../src/sync/normalise';

describe('mapBitbucketCommits', () => {
  it('maps recent commit details for dashboard display', () => {
    expect(mapBitbucketCommits({
      values: [{
        hash: 'abc123',
        message: 'Add commit sync\n\nMore details',
        date: '2026-10-19T10:00:00.000Z',
        author: { raw: 'Demo User <demo@example.com>' },
        links: { html: { href: 'https://bitbucket.org/demo/repo/commits/abc123' } },
      }],
    })).toEqual([{
      hash: 'abc123',
      message: 'Add commit sync\n\nMore details',
      date: '2026-10-19T10:00:00.000Z',
      author: 'Demo User <demo@example.com>',
      url: 'https://bitbucket.org/demo/repo/commits/abc123',
    }]);
  });

  it('returns an empty list when the repository has no commits', () => {
    expect(mapBitbucketCommits({ values: [] })).toEqual([]);
  });
});
