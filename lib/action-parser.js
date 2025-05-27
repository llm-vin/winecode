class ActionParser {
  parseActions(text) {
    const actions = [];
    
    const fileActionRegex = /<file\s+action="([^"]+)"(?:\s+path="([^"]+)")?(?:\s+line1="([^"]+)")?(?:\s+line2="([^"]+)")?[^>]*>([\s\S]*?)<\/file>/g;
    const terminalActionRegex = /<terminal\s+command="([^"]+)"[^>]*>/g;
    
    let match;
    
    while ((match = fileActionRegex.exec(text)) !== null) {
      const [, action, path, line1, line2, content] = match;
      actions.push({
        type: 'file',
        action,
        path,
        line1: line1 ? parseInt(line1) : null,
        line2: line2 ? parseInt(line2) : null,
        content: content.trim()
      });
    }
    
    while ((match = terminalActionRegex.exec(text)) !== null) {
      const [, command] = match;
      actions.push({
        type: 'terminal',
        command
      });
    }
    
    return actions;
  }
}

module.exports = ActionParser;