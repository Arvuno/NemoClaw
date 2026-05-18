// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBedrockConverseRequest,
  createBedrockRuntimeAdapterServer,
  createOpenAiChatCompletion,
  streamOpenAiChatCompletion,
} from "../../../dist/lib/inference/bedrock-runtime-adapter";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  servers.length = 0;
});

function listen(server: http.Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("expected TCP address");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

describe("Bedrock Runtime OpenAI adapter", () => {
  it("converts text chat completions to Converse and back", async () => {
    const send = vi.fn(async (command: any) => {
      expect(command.constructor.name).toBe("ConverseCommand");
      expect(command.input).toMatchObject({
        modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        messages: [{ role: "user", content: [{ text: "hello" }] }],
        inferenceConfig: { temperature: 0.2, maxTokens: 128 },
      });
      return {
        output: { message: { content: [{ text: "OK" }] } },
        stopReason: "end_turn",
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      };
    });

    const response = await createOpenAiChatCompletion(
      {
        model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.2,
        max_tokens: 128,
      },
      { send },
    );

    expect(response.choices[0].message.content).toBe("OK");
    expect(response.choices[0].finish_reason).toBe("stop");
    expect(response.usage).toEqual({
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
    });
  });

  it("streams text deltas as OpenAI chat completion chunks", async () => {
    async function* stream() {
      yield { messageStart: { role: "assistant" } };
      yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "hel" } } };
      yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "lo" } } };
      yield { messageStop: { stopReason: "end_turn" } };
    }
    const send = vi.fn(async (command: any) => {
      expect(command.constructor.name).toBe("ConverseStreamCommand");
      return { stream: stream() };
    });

    const chunks: any[] = [];
    for await (const chunk of await streamOpenAiChatCompletion(
      {
        model: "anthropic.claude-3-haiku-20240307-v1:0",
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      },
      { send },
    )) {
      chunks.push(chunk);
    }

    expect(chunks.map((chunk: any) => chunk.choices[0].delta.content).filter(Boolean)).toEqual([
      "hel",
      "lo",
    ]);
    expect(chunks.at(-1)?.choices[0].finish_reason).toBe("stop");
  });

  it("round-trips tool calls and tool results", async () => {
    const input = buildBedrockConverseRequest({
      model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      messages: [
        { role: "user", content: "weather" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "toolu_1",
              type: "function",
              function: { name: "get_weather", arguments: "{\"city\":\"Seattle\"}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "toolu_1", content: "{\"temperature\":55}" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object", properties: { city: { type: "string" } } },
          },
        },
      ],
    });

    expect(input.messages?.[1]?.content?.[0]).toEqual({
      toolUse: { toolUseId: "toolu_1", name: "get_weather", input: { city: "Seattle" } },
    });
    expect(input.messages?.[2]?.content?.[0]).toEqual({
      toolResult: { toolUseId: "toolu_1", content: [{ json: { temperature: 55 } }] },
    });
    expect(input.toolConfig?.tools?.[0]).toMatchObject({
      toolSpec: { name: "get_weather" },
    });

    const response = await createOpenAiChatCompletion(
      { model: "anthropic.claude", messages: [{ role: "user", content: "weather" }] },
      {
        send: vi.fn(async () => ({
          output: {
            message: {
              content: [
                {
                  toolUse: {
                    toolUseId: "toolu_2",
                    name: "get_weather",
                    input: { city: "Portland" },
                  },
                },
              ],
            },
          },
          stopReason: "tool_use",
        })),
      },
    );
    expect(response.choices[0].message.tool_calls).toEqual([
      {
        id: "toolu_2",
        type: "function",
        function: { name: "get_weather", arguments: "{\"city\":\"Portland\"}" },
      },
    ]);
    expect(response.choices[0].finish_reason).toBe("tool_calls");
  });

  it("returns a clear 400 for unsupported OpenAI request fields", async () => {
    const server = createBedrockRuntimeAdapterServer({
      token: "local-token",
      endpointUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
      region: "us-east-1",
      client: { send: vi.fn() },
    });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer local-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic.claude",
        messages: [{ role: "user", content: "hello" }],
        response_format: { type: "json_object" },
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.message).toContain("Unsupported OpenAI chat field");
  });

  it("maps Bedrock auth and region failures to adapter errors", async () => {
    const server = createBedrockRuntimeAdapterServer({
      token: "local-token",
      endpointUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
      region: "us-east-1",
      client: {
        send: vi.fn(async () => {
          throw new Error("Could not load credentials from any providers");
        }),
      },
    });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer local-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic.claude",
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(response.status).toBe(502);
    const body = (await response.json()) as any;
    expect(body.error.message).toContain("Could not load credentials");
  });
});
