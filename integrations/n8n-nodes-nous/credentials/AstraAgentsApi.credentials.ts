import type {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class AstraAgentsApi implements ICredentialType {
  name = 'astraAgentsApi';
  displayName = 'Astra Agents API';
  documentationUrl = 'https://github.com/swarupd227/atlas-agent-platform/tree/main/integrations/n8n';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://host.docker.internal:5000',
      placeholder: 'http://host.docker.internal:5000',
      description: 'Base URL of the Astra Agents server. From an n8n Docker container, the host is host.docker.internal.',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Value of ASTRA_PUBLIC_API_KEY on the Astra Agents server.',
    },
  ];

  // Injects the API key on every request the node makes with these credentials.
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        'x-api-key': '={{$credentials.apiKey}}',
      },
    },
  };
}
