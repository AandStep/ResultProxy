class BaseNetworkManager {
  /**
   * Возвращает объект { received: number, sent: number } в байтах
   */
  async getNetworkTraffic() {
    throw new Error("Method getNetworkTraffic must be implemented");
  }
}

module.exports = BaseNetworkManager;
