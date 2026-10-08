import assert from 'node:assert/strict';
import test from 'node:test';
import { isPdfFile, validatePdfFile, MAX_PDF_BYTES } from '../src/components/api-management/pdfAttachment.ts';
import { buildProviderChatRequest } from '../src/components/api-management/aiProviderCatalog.ts';

const pdf = Buffer.from('%PDF-1.7\nSynthetic test document\n%%EOF').toString('base64');
const message = {role:'user', text:'整理這份 PDF', documents:[{name:'驗證文件.pdf', mimeType:'application/pdf', data:pdf}]};
const request = (provider, messages = [message]) => buildProviderChatRequest({provider, baseUrl:'https://provider.invalid/v1', apiKey:'test-only-key', model:'test-model', messages});

test('Windows PDF uploads accept missing, generic and alternate MIME types and validate their bytes', async () => {
  for(const type of ['', 'application/octet-stream', 'application/x-pdf']) {
    const file = new File([Buffer.from(pdf,'base64')], '文件.PDF', {type});
    assert.ok(isPdfFile(file));
    await validatePdfFile(file);
  }
  assert.ok(isPdfFile({name:'無副檔名',type:'application/pdf'}));
  assert.equal(isPdfFile({name:'照片.png',type:'image/png'}),false);
  await assert.rejects(validatePdfFile(new File(['not a PDF'], '偽裝.pdf')), /不是有效的 PDF/);
  await assert.rejects(validatePdfFile(new File([], '空檔.pdf')), /空白檔案/);
  await assert.rejects(validatePdfFile({name:'大型.pdf',type:'',size:MAX_PDF_BYTES+1}), /50MB/);
});

test('Gemini keeps PDF bytes and filename in inline document parts', () => {
  const result = request('gemini');
  const parts = result.body.contents[0].parts;
  assert.equal(parts.find(p=>p.inlineData).inlineData.mimeType,'application/pdf');
  assert.equal(parts.find(p=>p.inlineData).inlineData.data,pdf);
  assert.match(JSON.stringify(parts), /驗證文件.pdf/);
});

test('OpenAI sends PDF file blocks, Claude sends document blocks, and mixed images remain images', () => {
  const mixed = {...message,images:[{mimeType:'image/png',data:'cG5n'}]};
  const openai = request('openai',[mixed]).body.messages[0].content;
  assert.deepEqual(openai.find(p=>p.type==='file').file,{filename:'驗證文件.pdf',file_data:`data:application/pdf;base64,${pdf}`});
  assert.equal(openai.find(p=>p.type==='image_url').image_url.url,'data:image/png;base64,cG5n');
  const claude = request('claude',[mixed]).body.messages[0].content;
  assert.equal(claude.find(p=>p.type==='document').source.media_type,'application/pdf');
  assert.equal(claude.find(p=>p.type==='document').source.data,pdf);
  assert.equal(claude.find(p=>p.type==='image').source.media_type,'image/png');
  assert.ok(request('openai').body.messages[0].content.find(p=>p.type==='file'),'PDF without any images is supported');
});

test('unsupported document routes fail before a request, not as a network retry', () => {
  assert.throws(()=>request('openai-compatible'),/自訂服務尚未確認支援 PDF/);
  assert.throws(()=>request('claude',[{...message,documents:[{...message.documents[0],mimeType:'application/msword'}]}]),/只支援 PDF/);
});

test('PDF limits cover prior documents and base64 expansion', () => {
  const large = { ...message, documents:[{...message.documents[0],data:'A'.repeat(24 * 1024 * 1024)}]};
  assert.throws(()=>request('claude',[large,large]), /32MB/);
  assert.throws(()=>request('gemini',[large,large,large,large,large]), /100MB/);
  assert.throws(()=>request('openai',[large,large,large]), /50MB/);
});
