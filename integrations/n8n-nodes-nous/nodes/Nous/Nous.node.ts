import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  IHttpRequestMethods,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export class Nous implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nous',
    name: 'nous',
    icon: 'file:nous.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Run Nous (Astra Agents) agents and fetch results',
    defaults: { name: 'Nous' },
    inputs: ['main' as any],
    outputs: ['main' as any],
    credentials: [{ name: 'nousApi', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Run Agent', value: 'runAgent', action: 'Run an agent', description: 'Start an agent run and optionally wait for the result' },
          { name: 'Get Run Result', value: 'getRun', action: 'Get a run result', description: 'Fetch the status/result of a run by ID' },
        ],
        default: 'runAgent',
      },
      {
        displayName: 'Agent ID',
        name: 'agentId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['runAgent'] } },
        description: 'ID of the Nous agent to run',
      },
      {
        displayName: 'Input',
        name: 'input',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        displayOptions: { show: { operation: ['runAgent'] } },
        description: 'Input payload/prompt passed to the agent',
      },
      {
        displayName: 'Wait for Completion',
        name: 'waitForCompletion',
        type: 'boolean',
        default: true,
        displayOptions: { show: { operation: ['runAgent'] } },
        description: 'Whether to poll until the run completes and return the result',
      },
      {
        displayName: 'Timeout (Seconds)',
        name: 'timeoutSeconds',
        type: 'number',
        default: 120,
        displayOptions: { show: { operation: ['runAgent'], waitForCompletion: [true] } },
        description: 'Maximum time to wait for the run to complete',
      },
      {
        displayName: 'Run ID',
        name: 'runId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['getRun'] } },
        description: 'ID of the run to fetch',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const creds = await this.getCredentials('nousApi');
    const baseUrl = String(creds.baseUrl || '').replace(/\/$/, '');

    const request = async (method: IHttpRequestMethods, path: string, body?: IDataObject) => {
      return this.helpers.httpRequestWithAuthentication.call(this, 'nousApi', {
        method,
        url: `${baseUrl}${path}`,
        body,
        json: true,
      });
    };

    for (let i = 0; i < items.length; i++) {
      const operation = this.getNodeParameter('operation', i) as string;
      try {
        if (operation === 'runAgent') {
          const agentId = this.getNodeParameter('agentId', i) as string;
          const input = this.getNodeParameter('input', i, '') as string;
          const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;

          const started = await request('POST', '/api/v1/runs', { agentId, input });
          const runId = (started as IDataObject).runId as string;

          if (!waitForCompletion || !runId) {
            returnData.push({ json: started as IDataObject, pairedItem: { item: i } });
            continue;
          }

          const timeoutMs = (this.getNodeParameter('timeoutSeconds', i, 120) as number) * 1000;
          const deadline = Date.now() + timeoutMs;
          let last: IDataObject = started as IDataObject;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2500));
            last = (await request('GET', `/api/v1/runs/${runId}`)) as IDataObject;
            const status = String(last.status || '');
            if (status === 'completed' || status === 'failed') break;
          }
          returnData.push({ json: last, pairedItem: { item: i } });
        } else if (operation === 'getRun') {
          const runId = this.getNodeParameter('runId', i) as string;
          const result = await request('GET', `/api/v1/runs/${runId}`);
          returnData.push({ json: result as IDataObject, pairedItem: { item: i } });
        } else {
          throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
