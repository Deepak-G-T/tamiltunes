/**
 * Abstract Base Music Provider Interface
 * All audio providers (JioSaavn, YouTube IFrame, Spotify, Local, etc.) must implement this interface.
 */
export class MusicProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Search for tracks
   * @param {string} query Search terms (e.g., 'Anirudh', 'Veezha Veera')
   * @param {object} options Optional search options: { limit, type }
   * @returns {Promise<Array|object>} Array of standardized song objects or { songs, albums, artists }
   */
  async searchTracks(query, options = {}) {
    throw new Error(`searchTracks() not implemented on provider '${this.name}'`);
  }

  /**
   * Get track metadata and playable media stream/embed by ID
   * @param {string} id Unique song ID
   * @returns {Promise<object|null>} Standardized song object
   */
  async getSong(id) {
    throw new Error(`getSong() not implemented on provider '${this.name}'`);
  }

  /**
   * Retrieve categorized home feed shelves (trending, latest, melodies, gana, etc.)
   * @returns {Promise<object>} Standardized home feed object
   */
  async getHomeFeed() {
    throw new Error(`getHomeFeed() not implemented on provider '${this.name}'`);
  }

  // Compatibility aliases
  async search(query, type = 'all') {
    return this.searchTracks(query, { type });
  }

  async getAlbum(id) {
    return null;
  }

  async getArtist(id) {
    return null;
  }

  async healthCheck() {
    return { status: 'healthy', provider: this.name };
  }
}
