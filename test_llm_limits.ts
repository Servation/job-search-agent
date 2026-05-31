import dotenv from 'dotenv';

dotenv.config();

const apiKey = 'lm-studio';
const endpoint = 'http://localhost:1234/v1';
const modelName = 'google/gemma-4-e4b';

const sampleResume = `
John Doe
Software Engineer
Experience: 3 years building React applications.
Skills: JavaScript, TypeScript, React, Node.js.
`.repeat(10); // simulate 1500 chars

const sampleJobDescBlock = `
About Us: We are a cool company doing cool things.
Requirements:
- 5+ years of experience in Vue.js (Must Have)
- Strong backend experience with Python
- Excellent communication skills
`;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function performLLMRequest(
  endpoint: string, apiKey: string, modelName: string, prompt: string, timeoutMs: number
) {
  let targetUrl = endpoint.trim();
  if (targetUrl.endsWith('/chat/completions')) {
    targetUrl = targetUrl.replace(/\/chat\/completions$/, '');
  }
  const cleanCompletionsUrl = `${targetUrl}/chat/completions`;

  const body: any = {
    model: modelName,
    messages: [
      { role: 'system', content: 'You are an expert ATS resume analyzer. Return JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(cleanCompletionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: controller.signal
  });

  clearTimeout(timeoutId);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function runTest(descChars: number, batchSize: number, delayMs: number) {
  console.log(`\n--- Testing descChars: ${descChars}, batchSize: ${batchSize}, delayMs: ${delayMs} ---`);
  
  const description = sampleJobDescBlock.repeat(Math.ceil(descChars / sampleJobDescBlock.length)).slice(0, descChars);
  
  const prompt = `You are an expert Job Placement Agent. Evaluate the candidate resume against this job.
  Candidate Resume: """${sampleResume}"""
  Description: ${description}
  Return ONLY a raw JSON object (no markdown):
  {"matchScore":85,"matchReason":"test","skillsRequired":["Skill"],"industry":"Tech","experienceLevel":"Senior","salaryNum":120000}`;

  const promises = [];
  const start = Date.now();
  let successCount = 0;
  
  for (let i = 0; i < batchSize; i++) {
    const p = (async () => {
      try {
        const t0 = Date.now();
        await performLLMRequest(endpoint, apiKey, modelName, prompt, 60000); // 60s timeout
        const t1 = Date.now();
        console.log(`[Req ${i+1}] Success in ${t1 - t0}ms`);
        successCount++;
      } catch (err: any) {
        console.error(`[Req ${i+1}] Failed: ${err.message}`);
      }
    })();
    promises.push(p);
    
    if (delayMs > 0 && i < batchSize - 1) {
      await delay(delayMs);
    }
  }

  await Promise.all(promises);
  const end = Date.now();
  console.log(`\nResult for [Chars: ${descChars}, Batch: ${batchSize}, Delay: ${delayMs}ms]`);
  console.log(`Total Time: ${end - start}ms, Success Rate: ${successCount}/${batchSize}`);
}

async function main() {
  if (!apiKey) {
    console.error("No API key found in .env");
    return;
  }
  
  console.log(`Using Model: ${modelName} at ${endpoint}`);
  
  // Test 1: Full Context (4000 chars), Batch 1, No Delay
  await runTest(4000, 1, 0);
  await delay(2000);
  
  // Test 2: Full Context (4000 chars), Batch 2 (simulate concurrent stress test)
  await runTest(4000, 2, 0);
}

main().catch(console.error);
