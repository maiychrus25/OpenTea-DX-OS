// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as fs from 'fs';
import * as path from 'path';

describe('n8n Workflows Static Analysis', () => {
  const workflowsDir = path.resolve(__dirname, '../../../../../../workflows');
  let workflowFiles: string[] = [];

  if (fs.existsSync(workflowsDir)) {
    workflowFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));
  }

  it('should find workflow files in the directory', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  describe.each(workflowFiles.map(f => [f]))('Workflow: %s', (filename) => {
    let workflowContent: string;
    let workflowJson: any;

    beforeAll(() => {
      workflowContent = fs.readFileSync(path.join(workflowsDir, filename), 'utf8');
      workflowJson = JSON.parse(workflowContent);
    });

    it('should be valid JSON format', () => {
      expect(workflowJson).toBeDefined();
      expect(Array.isArray(workflowJson.nodes)).toBe(true);
    });

    it('should contain an Error Trigger node', () => {
      const hasErrorTrigger = workflowJson.nodes.some(
        (node: any) => node.type === 'n8n-nodes-base.errorTrigger' || node.name === 'Error Trigger'
      );
      expect(hasErrorTrigger).toBe(true);
    });

    it('should not contain hardcoded credentials or API keys', () => {
      const sensitiveKeywords = ['password', 'secret', 'apikey', 'api_key', 'token'];
      
      workflowJson.nodes.forEach((node: any) => {
        // We allow references like $env.PASSWORD or references to credentials.
        // But we should flag if a raw string contains sensitive names that are not dynamic expressions.
        
        // Simple heuristic: JSON stringify the node and check for raw credentials.
        // Wait, n8n stores actual credentials in a separate secure vault. The workflow json only stores references.
        // We just verify that known properties don't have hardcoded plain text values.
        if (node.credentials) {
          // It's using credentials vault, which is safe.
        }
        
        const nodeStr = JSON.stringify(node.parameters || {}).toLowerCase();
        sensitiveKeywords.forEach(keyword => {
          // If the keyword is in the parameter keys, the value must be an expression or empty.
          // In n8n, expressions start with =
          for (const [key, value] of Object.entries(node.parameters || {})) {
            if (key.toLowerCase().includes(keyword) && typeof value === 'string') {
              if (value.trim() !== '' && !value.startsWith('=')) {
                // Potential hardcoded secret
                // Exception for standard parameter names that aren't actually secrets
                if (key !== 'authentication' && key !== 'tokenType') {
                  throw new Error(`Potential hardcoded secret found in node "${node.name}" for parameter "${key}". Use credentials or $env.`);
                }
              }
            }
          }
        });
      });
    });
  });
});
