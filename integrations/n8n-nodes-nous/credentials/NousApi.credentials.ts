import type {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class NousApi implements ICredentialType {
  name = 'nousApi';
  displayName = 'Nous API';
  documentationUrl = 'https://github.com/swarupd227/atlas-agent-platform/tree/main/integrations/n8n';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://host.docker.internal:5000',
      placeholder: 'http://host.docker.internal:5000',
      description: 'Base URL of the Nous server. From an n8n Docker container, the host is host.docker.internal.',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Value of NOUS_PUBLIC_API_KEY on the Nous server.',
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
