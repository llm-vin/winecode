class BaseTool {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  async execute(params) {
    throw new Error('execute method must be implemented by subclass');
  }

  validate(params) {
    return true;
  }

  formatError(error) {
    return `${this.name} error: ${error.message}`;
  }
}

module.exports = BaseTool;