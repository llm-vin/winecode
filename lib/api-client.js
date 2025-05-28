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
      return response.data.data.map(model => ({
        id: model.id,
        supportsFunction: model.function_calling || false
      }));
    } catch (error) {
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  async validateModel(modelName) {
    const models = await this.getAvailableModels();
    return models.some(model => model.id === modelName);
  }

  async getModelCapabilities(modelName) {
    const models = await this.getAvailableModels();
    const model = models.find(m => m.id === modelName);
    return model || { id: modelName, supportsFunction: false };
  }

  async sendMessage(model, messages, tools = null) {
    try {
      const requestBody = {
        model,
        messages
      };

      // Add tools if provided and model supports function calling
      if (tools) {
        const capabilities = await this.getModelCapabilities(model);
        if (capabilities.supportsFunction) {
          requestBody.tools = tools;
          requestBody.tool_choice = 'auto';
        }
      }

      const response = await this.client.post('/chat/completions', requestBody);
      return response.data.choices[0].message;
    } catch (error) {
      throw new Error(`API request failed: ${error.message}`);
    }
  }
}

module.exports = APIClient;
