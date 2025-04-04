// SharedWorker for Model Context Protocol (MCP) Host and Client
self.addEventListener('connect', (event) => {
  const port = event.ports[0];
  let contextStore = {}; // Simple in-memory store for contexts
  
  // MCP protocol constants
  const MCP_PROTOCOL_VERSION = '1.0';
  const MCP_MESSAGE_TYPES = {
    SET_CONTEXT: 'set-context',
    GET_CONTEXT: 'get-context',
    DELETE_CONTEXT: 'delete-context',
    LIST_CONTEXTS: 'list-contexts',
    RESPONSE: 'mcp-response'
  };

  const respond = (messageEvent, callback) => {
    const { type, payload } = messageEvent.data;

    if (type === 'user-message') {
      console.log('MCP received user message:', payload);
      // Validate message payload structure
      if (!payload || typeof payload !== 'object' || !payload.role || !payload.content) {
        console.error('Invalid message payload received:', payload);
        return;
      }

      // Parse MCP commands from content
      const content = payload.content.trim();
      const mcpCommand = parseMcpCommand(content);
      
      if (mcpCommand) {
        // Handle MCP command
        handleMcpCommand(mcpCommand, (response) => {
          const responsePayload = {
            content: response,
            user: 'MCP Agent',
            role: 'MCP'
          };
          port.postMessage({ type: 'worker-message', payload: responsePayload });
        });
      } else {
        // If not an MCP command, pass content to callback
        callback(payload);
      }
    } else {
      callback(payload);
    }
  };

  // Parse MCP commands from user messages
  const parseMcpCommand = (content) => {
    // Command format: /mcp <command> [key] [value]
    const mcpRegex = /^\/mcp\s+(\w+)(?:\s+([^\s]+)(?:\s+(.+))?)?$/i;
    const match = content.match(mcpRegex);
    
    if (match) {
      return {
        command: match[1].toLowerCase(),
        key: match[2],
        value: match[3]
      };
    }
    return null;
  };

  // Handle MCP commands
  const handleMcpCommand = (mcpCommand, callback) => {
    const { command, key, value } = mcpCommand;
    let response = '';

    switch (command) {
      case 'set':
        if (!key || !value) {
          response = 'Error: MCP set command requires both key and value.';
        } else {
          contextStore[key] = value;
          response = `Context '${key}' set successfully.`;
        }
        break;
        
      case 'get':
        if (!key) {
          response = 'Error: MCP get command requires a key.';
        } else if (contextStore[key] === undefined) {
          response = `Context '${key}' not found.`;
        } else {
          response = `${key}: ${contextStore[key]}`;
        }
        break;
        
      case 'delete':
        if (!key) {
          response = 'Error: MCP delete command requires a key.';
        } else if (contextStore[key] === undefined) {
          response = `Context '${key}' not found.`;
        } else {
          delete contextStore[key];
          response = `Context '${key}' deleted successfully.`;
        }
        break;
        
      case 'list':
        const keys = Object.keys(contextStore);
        if (keys.length === 0) {
          response = 'No contexts available.';
        } else {
          response = 'Available contexts:\n' + keys.join('\n');
        }
        break;
        
      case 'help':
        response = `MCP v${MCP_PROTOCOL_VERSION} Help:
/mcp set <key> <value> - Set a context
/mcp get <key> - Get a context value
/mcp delete <key> - Delete a context
/mcp list - List all available contexts
/mcp help - Show this help message`;
        break;
        
      default:
        response = `Unknown MCP command: ${command}. Type /mcp help for available commands.`;
    }
    
    callback(response);
  };

  port.addEventListener('message', (messageEvent) => {
    respond(messageEvent, (payload) => {
      // If not handled as an MCP command, just echo the message
      if (payload && payload.content) {
        payload.content = `MCP received: ${payload.content}`;
        payload.user = 'MCP Agent';
        payload.role = 'mcp';
      }
      port.postMessage({ type: 'worker-message', payload });
    });
  });

  port.start();
});