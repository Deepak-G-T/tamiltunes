/**
 * Abstract Base Music Provider
 */
export class MusicProvider {
  constructor(name) {
    this.name = name;
  }

  async search(query, type = 'all') {
    throw new Error('search() not implemented');
  }

  async searchSongs(query, limit = 20) {
    throw new Error('searchSongs() not implemented');
  }

  async searchAlbums(query, limit = 20) {
    throw new Error('searchAlbums() not implemented');
  }

  async searchArtists(query, limit = 20) {
    throw new Error('searchArtists() not implemented');
  }

  async getSong(id) {
    throw new Error('getSong() not implemented');
  }

  async getAlbum(id) {
    throw new Error('getAlbum() not implemented');
  }

  async getArtist(id) {
    throw new Error('getArtist() not implemented');
  }

  async getHomeFeed() {
    throw new Error('getHomeFeed() not implemented');
  }

  async healthCheck() {
    return { status: 'healthy', provider: this.name };
  }
}
