import test from 'node:test';
import assert from 'node:assert/strict';
import {readSectionReportContent,writeSectionReportContent} from '../src/components/performance/sectionReportContent.mjs';
test('section reports preserve structured results, risks and support across saves',()=>{
 const data={achievements:'完成硬體驗證\n良率提升',risks:'缺料，9/20 追蹤',support:'需要跨課支援'};
 assert.deepEqual(readSectionReportContent(writeSectionReportContent(data)),data);
});
test('legacy summaries remain readable and editable without loss',()=>{
 const raw='舊資料\n成果、問題及建議';
 assert.equal(readSectionReportContent(raw).achievements,raw);
 assert.equal(readSectionReportContent(writeSectionReportContent(readSectionReportContent(raw))).achievements,raw);
});
test('malformed payloads preserve text and unexpected fields cannot inject manager scores',()=>{
 assert.equal(readSectionReportContent('RD2_SECTION_V1\n{broken').achievements,'RD2_SECTION_V1\n{broken');
 const normalized=readSectionReportContent('RD2_SECTION_V1\n{"achievements":"成果","score":99,"support":null}');
 assert.deepEqual(normalized,{achievements:'成果',risks:'',support:''});
});
