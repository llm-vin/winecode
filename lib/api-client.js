const axios = require('axios');

class APIClient {
  constructor(apiKey = null, baseURL = 'https://api.llm.vin/v1') {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      }
    });
  }

  async getAvailableModels() {
    try {
      const response = await this.client.get('/models');
      return response.data.data.map(model => model.id);
    } catch (error) {
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  async validateModel(modelName) {
    const models = await this.getAvailableModels();
    return models.includes(modelName);
  }

  async sendMessage(model, messages) {
    try {
      const response = await this.client.post('/chat/completions', {
        model,
        messages
      });
      return response.data.choices[0].message.content;
    } catch (error) {
      throw new Error(`API request failed: ${error.message}`);
    }
  }
}

module.exports = APIClient;