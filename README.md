# Box AI MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to extract metadata from Box files using Box AI. This server provides tools for authenticating with Box, extracting structured and unstructured metadata from documents, and retrieving file information.

> **⚠️ Disclaimer:** This is an independent, open-source project and is not affiliated with, endorsed by, or associated with Box, Inc. This is a fun personal project created for educational and experimental purposes. Use at your own risk.

## Features

- 🔐 **JWT Authentication** - Secure server-to-server authentication using Box JWT
- 🤖 **Box AI Integration** - Leverage Box AI to extract metadata from documents
- 📊 **Structured Metadata Extraction** - Extract data using predefined field definitions or templates
- 🎯 **Freeform Metadata Extraction** - Use natural language prompts to extract any metadata
- 📁 **File Information** - Get detailed information about Box files
- 🔄 **Token Management** - Automatic token expiration tracking and refresh

## Prerequisites

- Node.js 18+ (with ES modules support)
- A Box Developer account
- A Box application configured with JWT authentication

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Ensure you have the following from your Box Developer Console:
   - Client ID
   - Client Secret (Enterprise ID)
   - Private Key (from generated key pair)
   - Public Key ID (kid)
   - Subject ID (User ID or Enterprise ID)

## Configuration

### Setting up Box Application

1. Go to [Box Developer Console](https://app.box.com/developers/console)
2. Create a new "Custom App"
3. Select "Server Authentication (with JWT)"
4. Generate a public/private key pair
5. Download the configuration file (contains your credentials)
6. Authorize the application in your Box enterprise

### Claude Desktop Configuration

Add the server to your Claude Desktop MCP configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "box-ai-server": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/MCP_DEMO/mcp.js"],
      "env": {
        "NODE_OPTIONS": "--no-deprecation"
      }
    }
  }
}
```

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "box-ai-server": {
      "command": "node",
      "args": ["C:\\path\\to\\MCP_DEMO\\mcp.js"]
    }
  }
}
```

After updating the config, restart Claude Desktop.

## Usage

### Authentication

Before using any Box API tools, you need to authenticate using the `box_authenticate` tool:

**Required Parameters:**
- `clientId` - Your Box application client ID
- `clientSecret` - Your Box application client secret (Enterprise ID)
- `privateKey` - Your private key in PEM format (from Box Developer Console)
- `publicKeyId` - The Public Key ID (kid) from Box Developer Console
- `subjectType` - Either `"user"` or `"enterprise"`
- `subjectId` - The User ID or Enterprise ID to authenticate as

**Example:**
```
Authenticate with Box API using:
- Client ID: abc123...
- Client Secret: xyz789...
- Private Key: -----BEGIN RSA PRIVATE KEY-----...
- Public Key ID: abc123def456
- Subject Type: enterprise
- Subject ID: 12345678
```

### Alternative: Environment Variable

You can also set a Box access token directly via environment variable:

```bash
export BOX_ACCESS_TOKEN="your-access-token-here"
```

## Available Tools

### 1. `box_authenticate`
Authenticate with Box API using JWT authentication. Stores the access token in memory for use by other tools.

**Parameters:**
- `clientId` (string) - Box application client ID
- `clientSecret` (string) - Box application client secret
- `privateKey` (string) - Private key in PEM format
- `publicKeyId` (string) - Public Key ID
- `subjectType` ("user" | "enterprise") - Type of subject
- `subjectId` (string) - User ID or Enterprise ID

### 2. `box_set_access_token`
Manually set a Box access token if you already have one from another source.

**Parameters:**
- `accessToken` (string) - Box access token
- `expiresIn` (number, optional) - Token expiration time in seconds

### 3. `box_get_auth_status`
Check the current authentication status and token information.

**Parameters:** None

### 4. `box_extract_metadata`
Extract metadata from a Box file using Box AI with a natural language prompt (freeform extraction).

**Parameters:**
- `fileId` (string) - The Box file ID
- `prompt` (string) - Natural language prompt describing what to extract
- `format` ("json" | "xml" | "text", optional) - Output format (default: "json")

**Example:**
```
Extract metadata from file "123456789" with prompt:
"Extract the invoice number, date, total amount, and vendor name"
```

### 5. `box_extract_structured_metadata`
Extract structured metadata using predefined field definitions or a metadata template.

**Parameters:**
- `fileId` (string) - The Box file ID
- `fields` (array, optional) - Array of field definitions:
  - `name` (string) - Field name
  - `description` (string) - Description of what to extract
  - `type` ("string" | "number" | "date" | "boolean", optional) - Data type
- `templateId` (string, optional) - Metadata template ID (if using a template)

**Example:**
```json
{
  "fileId": "123456789",
  "fields": [
    {
      "name": "invoiceNumber",
      "description": "The invoice number",
      "type": "string"
    },
    {
      "name": "totalAmount",
      "description": "The total amount due",
      "type": "number"
    }
  ]
}
```

### 6. `box_get_file_info`
Get basic information about a Box file including name, size, type, and metadata.

**Parameters:**
- `fileId` (string) - The Box file ID

## Examples

### Example 1: Extract Invoice Metadata

```
1. Authenticate with Box API
2. Use box_extract_metadata with:
   - File ID: 123456789
   - Prompt: "Extract invoice number, date, vendor, line items with descriptions and amounts, and total"
   - Format: json
```

### Example 2: Extract Structured Contract Data

```
1. Authenticate with Box API
2. Use box_extract_structured_metadata with:
   - File ID: 987654321
   - Fields:
     - name: "contractDate", description: "Contract execution date", type: "date"
     - name: "parties", description: "Names of all parties to the contract", type: "string"
     - name: "expirationDate", description: "Contract expiration date", type: "date"
     - name: "isActive", description: "Whether the contract is currently active", type: "boolean"
```

### Example 3: Get File Information

```
1. Authenticate with Box API
2. Use box_get_file_info with File ID: 123456789
```

## Troubleshooting

### Server Not Showing Tools

- Ensure the `inputSchema` format matches the expected format (plain objects, not `z.object()`)
- Check that Node.js version is 18+
- Verify the file path in Claude Desktop config is correct
- Restart Claude Desktop after configuration changes

### Authentication Errors

- Verify your private key is in correct PEM format (includes `-----BEGIN` and `-----END` lines)
- Ensure your Box application is authorized in your enterprise
- Check that the subject ID matches a valid user or enterprise ID
- Verify the public key ID (kid) matches the one in Box Developer Console

### Token Expiration

- Tokens are automatically tracked and will expire after their lifetime
- Use `box_get_auth_status` to check token expiration
- Re-authenticate using `box_authenticate` when tokens expire

### API Errors

- Ensure you have proper permissions in Box for the files you're accessing
- Verify the file ID is correct
- Check that Box AI features are enabled for your Box account

## Project Structure

```
MCP_DEMO/
├── mcp.js              # Main MCP server implementation
├── package.json        # Dependencies and scripts
├── package-lock.json   # Locked dependency versions
└── README.md          # This file
```

## Dependencies

- `@modelcontextprotocol/sdk` (^1.16) - MCP SDK for server implementation
- `zod` (^3.25.76) - Schema validation for tool inputs
- Node.js built-in `crypto` - For JWT signing

## License

ISC

## Contributing

This is a personal project, but feel free to fork and modify for your own use!

## Acknowledgments

- Built using the [Model Context Protocol](https://modelcontextprotocol.io/)
- Uses the [Box API](https://developer.box.com/) and [Box AI](https://developer.box.com/guides/box-ai/)
- Inspired by the need to extract metadata from documents using AI

---

**Note:** This project is not affiliated with Box, Inc. Box, Box AI, and related trademarks are property of their respective owners.
