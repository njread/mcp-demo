import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import crypto from "crypto";

// Box API configuration
const BOX_API_BASE_URL = "https://api.box.com/2.0";
const BOX_OAUTH_URL = "https://api.box.com/oauth2/token";
const BOX_ACCESS_TOKEN = process.env.BOX_ACCESS_TOKEN;

// In-memory token storage (can be set via authentication tool)
let storedAccessToken = null;
let tokenExpiresAt = null;

// Helper function to get the active access token
function getAccessToken() {
  if (storedAccessToken) {
    // Check if token is still valid (with 5 minute buffer)
    if (tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
      return storedAccessToken;
    }
    // Token expired, clear it
    storedAccessToken = null;
    tokenExpiresAt = null;
  }
  return BOX_ACCESS_TOKEN;
}

// Helper function to make Box API requests
async function boxApiRequest(endpoint, options = {}) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error(
      "No valid Box access token. Please authenticate using box_authenticate tool or set BOX_ACCESS_TOKEN environment variable."
    );
  }

  const url = `${BOX_API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Box API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

// Create Box MCP server
const server = new McpServer({
  name: "box-ai-server",
  version: "1.0.0",
});

// Helper function to create and sign JWT assertion
function createJWTAssertion(
  clientId,
  clientSecret,
  privateKey,
  publicKeyId,
  subjectType,
  subjectId
) {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomBytes(16).toString("hex");

  // JWT header
  const header = {
    alg: "RS256",
    kid: publicKeyId,
    typ: "JWT",
  };

  // JWT claims
  const claims = {
    iss: clientId,
    sub: subjectId,
    box_sub_type: subjectType,
    aud: BOX_OAUTH_URL,
    jti: jti,
    exp: now + 60, // Expires in 60 seconds
    iat: now,
  };

  // Helper function to convert base64 to base64url
  const base64url = (str) => {
    return str
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  // Encode header and payload
  const encodedHeader = base64url(
    Buffer.from(JSON.stringify(header)).toString("base64")
  );
  const encodedPayload = base64url(
    Buffer.from(JSON.stringify(claims)).toString("base64")
  );

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signatureInput);
  const signature = base64url(sign.sign(privateKey, "base64"));

  // Return complete JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Tool: Authenticate with Box API using JWT authentication
server.registerTool(
  "box_authenticate",
  {
    title: "Authenticate with Box API (JWT)",
    description:
      "Obtain an access token from Box using JWT (JSON Web Token) authentication. This is for server-to-server authentication using a private key and stores the token in memory for use by other tools.",
    inputSchema: {
      clientId: z
        .string()
        .describe("Box application client ID"),
      clientSecret: z
        .string()
        .describe("Box application client secret (enterprise ID)"),
      privateKey: z
        .string()
        .describe(
          "Private key in PEM format (from Box Developer Console key pair)"
        ),
      publicKeyId: z
        .string()
        .describe("Public Key ID (kid) from Box Developer Console"),
      subjectType: z
        .enum(["user", "enterprise"])
        .describe("Type of subject to authenticate as (user or enterprise)"),
      subjectId: z
        .string()
        .describe(
          "User ID or Enterprise ID to authenticate as (required for JWT)"
        ),
    },
  },
  async ({
    clientId,
    clientSecret,
    privateKey,
    publicKeyId,
    subjectType,
    subjectId,
  }) => {
    try {
      // Create JWT assertion
      const assertion = createJWTAssertion(
        clientId,
        clientSecret,
        privateKey,
        publicKeyId,
        subjectType,
        subjectId
      );

      // Exchange JWT assertion for access token
      const params = new URLSearchParams();
      params.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      params.append("assertion", assertion);

      const response = await fetch(BOX_OAUTH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Authentication failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const tokenData = await response.json();

      // Store token in memory
      storedAccessToken = tokenData.access_token;
      if (tokenData.expires_in) {
        tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "Successfully authenticated with Box API using JWT",
                tokenType: tokenData.token_type,
                expiresIn: tokenData.expires_in,
                expiresAt: tokenExpiresAt
                  ? new Date(tokenExpiresAt).toISOString()
                  : null,
                restrictedTo: tokenData.restricted_to,
                issuedTokenType: tokenData.issued_token_type,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Authentication error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Set access token directly (alternative to OAuth flow)
server.registerTool(
  "box_set_access_token",
  {
    title: "Set Box Access Token",
    description:
      "Manually set a Box access token. Useful if you already have a token from another source. The token will be stored in memory for use by other tools.",
    inputSchema: {
      accessToken: z
        .string()
        .describe("Box access token to use"),
      expiresIn: z
        .number()
        .optional()
        .describe(
          "Token expiration time in seconds (optional, for automatic expiration tracking)"
        ),
    },
  },
  async ({ accessToken, expiresIn }) => {
    try {
      storedAccessToken = accessToken;
      if (expiresIn) {
        tokenExpiresAt = Date.now() + expiresIn * 1000;
      } else {
        tokenExpiresAt = null;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "Access token stored successfully",
                expiresAt: tokenExpiresAt
                  ? new Date(tokenExpiresAt).toISOString()
                  : "No expiration set",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting access token: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Get current authentication status
server.registerTool(
  "box_get_auth_status",
  {
    title: "Get Box Authentication Status",
    description:
      "Check the current authentication status and token information.",
    inputSchema: {},
  },
  async () => {
    const accessToken = getAccessToken();
    const hasToken = !!accessToken;
    const isStored = !!storedAccessToken;
    const isEnvVar = !!BOX_ACCESS_TOKEN && !isStored;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              authenticated: hasToken,
              tokenSource: isStored
                ? "stored_in_memory"
                : isEnvVar
                ? "environment_variable"
                : "none",
              expiresAt: tokenExpiresAt
                ? new Date(tokenExpiresAt).toISOString()
                : null,
              isExpired: tokenExpiresAt
                ? Date.now() >= tokenExpiresAt
                : null,
              timeUntilExpiry: tokenExpiresAt
                ? Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000))
                : null,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool: Extract metadata from a Box file using freeform extraction
server.registerTool(
  "box_extract_metadata",
  {
    title: "Extract Metadata from Box File (Freeform)",
    description:
      "Extract metadata from a Box file using Box AI with a natural language prompt. Returns extracted metadata in JSON format.",
    inputSchema: {
      fileId: z
        .string()
        .describe("The Box file ID to extract metadata from"),
      prompt: z
        .string()
        .describe(
          "Natural language prompt describing what metadata to extract (e.g., 'Extract the invoice number, date, total amount, and vendor name')"
        ),
      format: z
        .enum(["json", "xml", "text"])
        .optional()
        .default("json")
        .describe("Output format for extracted metadata"),
    },
  },
  async ({ fileId, prompt, format = "json" }) => {
    try {
      const response = await boxApiRequest("/ai/extract", {
        method: "POST",
        body: JSON.stringify({
          file: {
            id: fileId,
          },
          prompt: prompt,
          format: format,
        }),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error extracting metadata: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Extract structured metadata from a Box file
server.registerTool(
  "box_extract_structured_metadata",
  {
    title: "Extract Structured Metadata from Box File",
    description:
      "Extract structured metadata from a Box file using Box AI with a predefined metadata template or field definitions.",
    inputSchema: {
      fileId: z
        .string()
        .describe("The Box file ID to extract metadata from"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Field name"),
            description: z.string().describe("Description of what to extract"),
            type: z
              .enum(["string", "number", "date", "boolean"])
              .optional()
              .describe("Expected data type"),
          })
        )
        .describe(
          "Array of field definitions describing what metadata to extract"
        ),
      templateId: z
        .string()
        .optional()
        .describe(
          "Optional metadata template ID if using a predefined template"
        ),
    },
  },
  async ({ fileId, fields, templateId }) => {
    try {
      const requestBody = {
        file: {
          id: fileId,
        },
      };

      if (templateId) {
        requestBody.template = {
          id: templateId,
        };
      } else if (fields) {
        requestBody.fields = fields.map((field) => ({
          name: field.name,
          description: field.description,
          type: field.type || "string",
        }));
      }

      const response = await boxApiRequest("/ai/extract_structured", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error extracting structured metadata: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Get file information from Box
server.registerTool(
  "box_get_file_info",
  {
    title: "Get Box File Information",
    description:
      "Get basic information about a Box file including name, size, type, and metadata.",
    inputSchema: {
      fileId: z.string().describe("The Box file ID"),
    },
  },
  async ({ fileId }) => {
    try {
      const response = await boxApiRequest(`/files/${fileId}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: response.id,
                name: response.name,
                size: response.size,
                type: response.type,
                createdAt: response.created_at,
                modifiedAt: response.modified_at,
                description: response.description,
                parent: response.parent,
                path: response.path_collection,
                sharedLink: response.shared_link,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting file info: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

