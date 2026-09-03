// Authoritative data transcribed from the user-provided workbook.
// Cell references and original KPI text are retained for auditing.
export const STANDARDS_SOURCE = {
  file: "RD2_HW2_KPI-OKR_IDP_example.xlsx",
  sheet: "評分表",
  version: "rd2-hw2-20260903",
  sha256: "d7d7f39ebdf7294682f6014329a365e9e19e1d2a9d810019d7fdc78b285d5281",
};

export const LEVELS = [
  {
    value: "junior",
    label: "Junior Engineer ( 13 , 19 )",
    policy: "BOM create and maintain.",
  },
  {
    value: "senior",
    label: "Senior Engineer ( 23,29 )",
    policy: "Mother board schematic design, GPIO table , Sequence design….etc.",
  },
  {
    value: "leader",
    label: "EE/FW Leader ( 29, 33 )",
    policy:
      "Own hardware design correctness and readiness for assigned L10/L11 designs, including board architecture, interface definition, key-component strategy, and power architecture inputs.",
  },
  {
    value: "manager",
    label: "Design Manager ( 33, 39 )",
    policy:
      "Own overall L10/L11 design success, including design strategy, resource planning, deliverable completeness, technical risk, and cross-domain alignment.",
  },
];

export const JOB_GRADES = [13, 19, 23, 29, 33, 39, 43, 49];

export const WEIGHT_GROUPS = [
  {
    grades: [19, 23],
    label: "職等 19，23",
    KPI: 60,
    OKR: 20,
    IDP: 20,
    source: "A7:D7",
  },
  {
    grades: [29, 33],
    label: "職等 29，33",
    KPI: 50,
    OKR: 30,
    IDP: 20,
    source: "A8:D8",
  },
  {
    grades: [39, 43],
    label: "職等 39，43",
    KPI: 40,
    OKR: 35,
    IDP: 25,
    source: "A9:D9",
  },
];

export const CATEGORY_GUIDANCE = {
  IDP: {
    title: "未來潛力",
    focus: "「未來潛力」, 不是公司要求，是你「個人投資自己」",
    details: [
      "技術學習與吸收：主動學習專案相關技術，能說明背景、風險點與應用場景。",
      "實務應用於專案：協助解決技術問題、流程卡關或溝通落差。",
      "知識輸出與影響力：透過文件、簡報或會議分享，把學習轉化為團隊知識或流程。",
    ],
    example:
      "透過系統性學習與實務應用，提升在專案中的技術判斷能力、問題解決能力與跨部門協作成效，並能將個人學習轉化為團隊可用的知識或流程\n1.技術學習與吸收\n    主動學習與專案相關之新技術 / 系統知識\n （如：Server / Rack / Power / FW / BOM / Data Center 架構等）\n   能說明技術背景、風險點與應用場景\n\n2.實務應用於專案\n   將新學習內容實際應用於專案中\n   協助解決技術問題、流程卡關或溝通落差\n\n3.知識輸出與影響力\n   透過文件、簡報或會議分享，將知識傳遞給團隊\n   非只停留在個人學習",
    source: "B13",
    cadence: "在較深的 1:1（半年 / 一年）",
  },
  OKR: {
    title: "創新與改善能力",
    focus: "看「影響力」而不是工時, 對齊公司與專案「結果」",
    details: [
      "提出新想法或改善流程。",
      "對問題具備前瞻性思考。",
      "提升團隊或工作效率，包含專利研發。",
    ],
    example:
      "-是否能提出新想法或改善流程\n-對問題是否有前瞻性思考\n-是否能有效提升團隊或工作的效率\n-專利研發\n\nRD2-HW2 2025Q4 OKR\n-KR1 : 技術創新，導入 PegaAI 助手與自動化檢查清單，減少 RD 資源投入20%並降低錯誤。\n-KR2 : 效率與品質並重，12月底交付16櫃，時間縮短 20%，現場支援一次完成率達 95%。\n-KR3 : 客戶成功策略，交付後 30 天完成性能驗證，並將專案轉化為 BU showcase，提升品牌影響力。​\n\nRD2-HW2 2026Q1 OKR\n-KR1 : 產品推廣 ,學習並製作與 NVIDIA 相關的 AI 模型測試，產出實際分數，作為 Sales 與 Marketing 推廣 GB300 產品時的佐證，證明 Pega 產品符合 NVIDIA 標準。初期以 L10 驗證，後期擴展至 L11\n-KR2 : 客戶感受 ,與Diag team 合作完成一套具備圖形化人機介面（GUI）、操作簡單的 Debug 工具，支援 FAE 與客戶在 Debug 與 RMA 流程中快速定位問題並執行必要操作。\n    1. 工具需支援至少 3 項核心 Debug 功能（例如：Log 擷取、錯誤碼分析、硬體狀態檢測）。​\n    2. 提供 RMA 流程專用功能（如故障分類、報告匯出）​\n    3. GUI 設計需符合 使用者操作步驟 < 3 步完成主要功能​\n    4. 工具啟動時間 < 5 秒，主要操作回應時間 < 2 秒。\n-KR3 : 優化生產管理 ,將 RD 所建立的生產測試管理系統（GUI）與 JIRA 進行整合，讓 MFG 與 RD 端能夠透過共同的介面與紀錄，完善 Carlo Next AI Server 的測試與執行流程",
    source: "B14",
    cadence: "在 team meeting（方向、取捨）",
  },
  KPI: {
    title: "基本盤穩定",
    focus: "確保「基本盤穩定」, 確保「你這個角色該做的事有做到」",
    details: [
      "依 HW／FW 角色的 Baseline 與 Outstanding 標準檢視成果。",
      "工作績效：目標達成、品質、準確度、效率、主動性與可靠度、問題解決與分析。",
      "工作態度：耐心、責任感、投入度、接受挑戰與壓力、政策遵循。",
    ],
    example: "以 STAR（情境／任務／行動／結果）描述實績。",
    source: "C15:E17",
    cadence: "在 1:1（穩定度、紀律）",
  },
};

export const KPI_REFERENCES = {
  EE: {
    junior: {
      baseline: [
        "BOM create and maintain.",
        "Work with senior engineer 2nd source spec check , apply symbol.",
        "Help senior engineer task.",
        "Daughter board design , such as Riser , interposer card …etc.",
        "Rework and Debug with senior engineer.",
        "Check list prepare",
        "Design no low level HW issue happened.",
      ],
      outstanding: [
        "Independent board level debug and daughter board schematic design.",
        "Independent MB schematic review and provide solution to owner.",
        "Prepare MB schematic file for vendor review and feedback to owner to modify.",
      ],
      source: "B16",
      raw: "Base line\n1.BOM create and maintain.\n2.Work with senior engineer 2nd source spec check , apply symbol.\n3.Help senior engineer task.\n4.Daughter board design , such as Riser , interposer card …etc.\n5.Rework and Debug with senior engineer.\n6.Check list prepare \n7.Design no low level HW issue happened.\n\nOutStanding\n1.Independent board level debug and daughter board schematic design.\n2.Independent MB schematic review and provide solution to owner.\n3.Prepare MB schematic file for vendor review and feedback to owner to modify. ",
    },
    senior: {
      baseline: [
        "Mother board schematic design, GPIO table , Sequence design….etc.",
        "Layout prepare & review such as layout guide, constraint rule, EQL…etc .",
        "Prepare schematic & Layout file for vendor review.",
        "Board level bug handle and solve.",
        "Help to solve junior engineer question.",
        "Check list prepare & no low level HW issue happened.",
      ],
      outstanding: [
        "System level debug and cross function team debug.",
        "Proposal prepare and solution survey.",
      ],
      source: "C16",
      raw: "Base line\n1. Mother board schematic design, GPIO table , Sequence design….etc.\n2. Layout prepare & review such as layout guide, constraint rule, EQL…etc .\n3. Prepare schematic & Layout file for vendor review.\n4. Board level bug handle and solve.\n5.Help to solve junior engineer question. \n6.Check list prepare & no low level HW issue happened.\n\nOutStanding\n1.System level debug and cross function team debug.\n2.Proposal prepare and solution survey.",
    },
    leader: {
      baseline: [
        "Own hardware design correctness and readiness for assigned L10/L11 designs, including board architecture, interface definition, key-component strategy, and power architecture inputs.",
        "Lead and document schematic, PCB layout, BOM technical, stack-up, power-budget, and SI/PI risk reviews; close review actions before release.",
        "Review junior/senior engineers’ design deliverables and checklists; ensure no preventable low-level design issue escapes to the next phase.",
        "Lead hardware bring-up and system-level debug during EVT/DVT/PVT; provide a documented root cause, corrective action, re-test request, and closure evidence for each major HW issue.",
        "Assess hardware design changes for schedule, BOM, validation, factory-build, customer-qualification, and cost impact before implementation.",
        "Coordinate HW actions with DM, PM, VM, Factory, and other functions; maintain clear owners, due dates, and closure criteria.",
        "Sign off hardware design readiness and PCB Gerber release only after critical risks and open HW issues are reviewed.",
        "Drive HW activities according to project milestones; ensure hardware deliverables meet committed schedules with transparent risk tracking and mitigation plans.",
        "Maintain HW design guidelines, review checklists, debug database, and lessons learned documentation for future reuse",
      ],
      outstanding: [
        "Resolve a critical or cross-functional HW issue with verified RCA/CA and no recurrence in the next build.",
        "Identify a design risk early and implement a preventive solution that avoids schedule slip, re-spin, or major rework.",
        "Deliver reusable design guidance, review checklists, or lessons learned adopted by the team.",
        "Lead customer/vendor technical alignment and obtain agreement on a complex hardware proposal or limitation.",
      ],
      source: "D16",
      raw: "Baseline — HW Leader\n1. Own hardware design correctness and readiness for assigned L10/L11 designs, including board architecture, interface definition, key-component strategy, and power architecture inputs.\n2. Lead and document schematic, PCB layout, BOM technical, stack-up, power-budget, and SI/PI risk reviews; close review actions before release.\n3. Review junior/senior engineers’ design deliverables and checklists; ensure no preventable low-level design issue escapes to the next phase.\n4. Lead hardware bring-up and system-level debug during EVT/DVT/PVT; provide a documented root cause, corrective action, re-test request, and closure evidence for each major HW issue.\n5. Assess hardware design changes for schedule, BOM, validation, factory-build, customer-qualification, and cost impact before implementation.\n6. Coordinate HW actions with DM, PM, VM, Factory, and other functions; maintain clear owners, due dates, and closure criteria.\n7. Sign off hardware design readiness and PCB Gerber release only after critical risks and open HW issues are reviewed.\n8.Drive HW activities according to project milestones; ensure hardware deliverables meet committed schedules with transparent risk tracking and mitigation plans.\n9.Maintain HW design guidelines, review checklists, debug database, and lessons learned documentation for future reuse\n\n\nOutstanding\n1. Resolve a critical or cross-functional HW issue with verified RCA/CA and no recurrence in the next build.\n2. Identify a design risk early and implement a preventive solution that avoids schedule slip, re-spin, or major rework.\n3. Deliver reusable design guidance, review checklists, or lessons learned adopted by the team.\n4. Lead customer/vendor technical alignment and obtain agreement on a complex hardware proposal or limitation.",
    },
    manager: {
      baseline: [
        "Own overall L10/L11 design success, including design strategy, resource planning, deliverable completeness, technical risk, and cross-domain alignment.",
        "Define design scope, owners, milestones, and acceptance criteria with PM, HW/FW Leaders, and VM; ensure design inputs support each NPI build.",
        "Review and approve system/design specifications, design proposals, major architecture decisions, and significant design changes.",
        "Govern P1, unknown, and system-level technical issues; ensure the correct technical owner completes RCA/CA and that risks are escalated with impact and options.",
        "Review the completeness and technical quality of L10/L11 design packages and confirm readiness for EVT/DVT/PVT gates.",
        "Evaluate design-change impact across schedule, cost, BOM, validation, factory build, and customer qualification; make or escalate go/no-go recommendations.",
        "Lead customer and management technical communication for major design decisions, limitations, waivers, and recovery plans.",
        "Review technical lessons learned and ensure preventive actions are incorporated into standards, checklists, or future designs.",
        "Ensure engineering resources, technical ownership, and review coverage are properly allocated to support program milestones and deliverables.",
      ],
      outstanding: [
        "Deliver all committed design gates on time with no critical design-governance gap or avoidable management/customer escalation.",
        "Resolve a major cross-domain technical risk through a documented decision, recovery plan, and verified closure.",
        "Improve design quality or execution efficiency through a reusable process, tool, architecture, or review mechanism with measurable benefit.",
        "Develop HW/FW Leaders so they can independently own technical reviews, issue closure, and gate evidence.",
        "Successfully manage multiple concurrent programs while maintaining schedule, quality, and team effectiveness.",
      ],
      source: "E16",
      raw: "Baseline — Design Manager\n1. Own overall L10/L11 design success, including design strategy, resource planning, deliverable completeness, technical risk, and cross-domain alignment.\n2. Define design scope, owners, milestones, and acceptance criteria with PM, HW/FW Leaders, and VM; ensure design inputs support each NPI build.\n3. Review and approve system/design specifications, design proposals, major architecture decisions, and significant design changes.\n4. Govern P1, unknown, and system-level technical issues; ensure the correct technical owner completes RCA/CA and that risks are escalated with impact and options.\n5. Review the completeness and technical quality of L10/L11 design packages and confirm readiness for EVT/DVT/PVT gates.\n6. Evaluate design-change impact across schedule, cost, BOM, validation, factory build, and customer qualification; make or escalate go/no-go recommendations.\n7. Lead customer and management technical communication for major design decisions, limitations, waivers, and recovery plans.\n8. Review technical lessons learned and ensure preventive actions are incorporated into standards, checklists, or future designs.\n9.Ensure engineering resources, technical ownership, and review coverage are properly allocated to support program milestones and deliverables.\n\nOutstanding\n1. Deliver all committed design gates on time with no critical design-governance gap or avoidable management/customer escalation.\n2. Resolve a major cross-domain technical risk through a documented decision, recovery plan, and verified closure.\n3. Improve design quality or execution efficiency through a reusable process, tool, architecture, or review mechanism with measurable benefit.\n4. Develop HW/FW Leaders so they can independently own technical reviews, issue closure, and gate evidence.\n5.Successfully manage multiple concurrent programs while maintaining schedule, quality, and team effectiveness.",
    },
  },
  FW: {
    junior: {
      baseline: [
        "Basic firmware coding and debugging under senior guidance.",
        "Unit test case development and execution.",
        "Firmware build process understanding and operation.",
        "Bug tracking and documentation (JIRA updates).",
        "Code review participation and learning.",
        "Firmware release package preparation.",
        "Follow coding standard, no low level FW issue happened.",
      ],
      outstanding: [
        "Independent module-level firmware development.",
        "Propose test automation improvements.",
        "Self-learning new MCU/SoC platforms and share with team.",
      ],
      source: "B17",
      raw: "Base line\n1. Basic firmware coding and debugging under senior guidance.\n2. Unit test case development and execution.\n3. Firmware build process understanding and operation.\n4. Bug tracking and documentation (JIRA updates).\n5. Code review participation and learning.\n6. Firmware release package preparation.\n7. Follow coding standard, no low level FW issue happened.\n\nOutStanding\n1. Independent module-level firmware development.\n2. Propose test automation improvements.\n3. Self-learning new MCU/SoC platforms and share with team.",
    },
    senior: {
      baseline: [
        "System firmware architecture design (Boot sequence, BIOS/BMC interaction).",
        "Driver development for hardware components (I2C, SPI, UART, PCIe...etc).",
        "Firmware debugging at system level with HW/SW team.",
        "Code review and mentor junior engineers.",
        "Firmware version control and release management.",
        "Performance optimization and memory management.",
      ],
      outstanding: [
        "Cross-platform firmware migration and porting.",
        "Security firmware implementation (Secure Boot, TPM).",
        "Proposal for new firmware architecture or tools.",
      ],
      source: "C17",
      raw: "Base line\n1. System firmware architecture design (Boot sequence, BIOS/BMC interaction).\n2. Driver development for hardware components (I2C, SPI, UART, PCIe...etc).\n3. Firmware debugging at system level with HW/SW team.\n4. Code review and mentor junior engineers.\n5. Firmware version control and release management.\n6. Performance optimization and memory management.\n\nOutStanding\n1. Cross-platform firmware migration and porting.\n2. Security firmware implementation (Secure Boot, TPM).\n3. Proposal for new firmware architecture or tools.",
    },
    leader: {
      baseline: [
        "Own firmware technical correctness and release readiness, including architecture, interfaces, boot flow, hardware interaction, security, and key feature design.",
        "Lead firmware design and code reviews; ensure coding standards, traceability, unit/integration tests, and release documentation are complete.",
        "Review engineers’ implementation and test evidence; close review actions and prevent low-level FW defects from escaping to system validation.",
        "Lead system-level firmware debug with HW, SW, Validation, and Factory; provide documented RCA, corrective action, regression scope, and closure evidence for major issues.",
        "Assess firmware changes for compatibility, performance, security, schedule, validation, factory, and customer impact before release.",
        "Maintain the firmware release plan, version control, known-issue list, and rollback/recovery strategy for each NPI phase.",
        "Provide technical input to validation plans and sign off firmware readiness against agreed gate and exit criteria.",
        "Drive HW activities according to project milestones; ensure hardware deliverables meet committed schedules with transparent risk tracking and mitigation plans.",
        "Responsible for consolidating development updates and reporting coding progress alongside bug resolution status to the Design Manager.",
      ],
      outstanding: [
        "Resolve a critical cross-functional FW issue with verified RCA/CA and no regression in the next release.",
        "Identify and eliminate a firmware architecture, security, or performance risk before it affects the project schedule or customer.",
        "Deliver reusable automation, diagnostic tools, coding standards, or architecture guidance with measurable quality or efficiency improvement.",
        "Lead customer/vendor technical alignment and obtain agreement on a complex firmware proposal, limitation, or recovery plan.",
        "Recover a critical schedule risk through effective technical planning and cross-functional coordination, minimizing impact to customer commitments.",
      ],
      source: "D17",
      raw: "Baseline — FW Leader\n1. Own firmware technical correctness and release readiness, including architecture, interfaces, boot flow, hardware interaction, security, and key feature design.\n2. Lead firmware design and code reviews; ensure coding standards, traceability, unit/integration tests, and release documentation are complete.\n3. Review engineers’ implementation and test evidence; close review actions and prevent low-level FW defects from escaping to system validation.\n4. Lead system-level firmware debug with HW, SW, Validation, and Factory; provide documented RCA, corrective action, regression scope, and closure evidence for major issues.\n5. Assess firmware changes for compatibility, performance, security, schedule, validation, factory, and customer impact before release.\n6. Maintain the firmware release plan, version control, known-issue list, and rollback/recovery strategy for each NPI phase.\n7. Provide technical input to validation plans and sign off firmware readiness against agreed gate and exit criteria.\n8.Drive HW activities according to project milestones; ensure hardware deliverables meet committed schedules with transparent risk tracking and mitigation plans.\n9. Responsible for consolidating development updates and reporting coding progress alongside bug resolution status to the Design Manager.\n\nOutstanding\n1. Resolve a critical cross-functional FW issue with verified RCA/CA and no regression in the next release.\n2. Identify and eliminate a firmware architecture, security, or performance risk before it affects the project schedule or customer.\n3. Deliver reusable automation, diagnostic tools, coding standards, or architecture guidance with measurable quality or efficiency improvement.\n4. Lead customer/vendor technical alignment and obtain agreement on a complex firmware proposal, limitation, or recovery plan.\n5.Recover a critical schedule risk through effective technical planning and cross-functional coordination, minimizing impact to customer commitments.",
    },
    manager: {
      baseline: [
        "Own overall firmware design success across L10/L11, including roadmap, architecture governance, staffing, deliverables, technical risk, and release strategy.",
        "Define firmware scope, owners, milestones, dependencies, and acceptance criteria with PM, FW Leader, HW Leader, and VM.",
        "Review and approve major firmware architecture decisions, platform strategy, customer requirements, security approach, and significant design changes.",
        "Govern P1, unknown, and system-level FW issues; ensure adequate resources, documented RCA/CA, regression evidence, and timely risk escalation.",
        "Confirm firmware plans and releases support EVT/DVT/PVT build, validation, factory, service, and customer-qualification needs.",
        "Evaluate change impact across hardware compatibility, validation coverage, schedule, factory deployment, serviceability, and customer commitments.",
        "Lead management/customer communication for major technical decisions, limitations, waivers, release risks, and recovery plans.",
        "Review firmware lessons learned and ensure preventive actions are institutionalized in architecture rules, coding standards, tests, or release processes.",
        "Consolidating development updates across all departmental projects to provide the Manager with regular, comprehensive reports on coding milestones and bug resolution progress.",
      ],
      outstanding: [
        "Deliver committed firmware gates on time with no critical governance gap, uncontrolled release, or avoidable escalation.",
        "Resolve a major cross-platform or cross-domain risk through a documented decision, recovery plan, and verified closure.",
        "Introduce a reusable platform, tool, automation, or governance mechanism with measurable quality, cycle-time, or resource benefit.",
        "Develop FW Leaders and engineers so they can independently own architecture reviews, issue closure, and release evidence.",
      ],
      source: "E17",
      raw: "Baseline — FW Design Manager\n1. Own overall firmware design success across L10/L11, including roadmap, architecture governance, staffing, deliverables, technical risk, and release strategy.\n2. Define firmware scope, owners, milestones, dependencies, and acceptance criteria with PM, FW Leader, HW Leader, and VM.\n3. Review and approve major firmware architecture decisions, platform strategy, customer requirements, security approach, and significant design changes.\n4. Govern P1, unknown, and system-level FW issues; ensure adequate resources, documented RCA/CA, regression evidence, and timely risk escalation.\n5. Confirm firmware plans and releases support EVT/DVT/PVT build, validation, factory, service, and customer-qualification needs.\n6. Evaluate change impact across hardware compatibility, validation coverage, schedule, factory deployment, serviceability, and customer commitments.\n7. Lead management/customer communication for major technical decisions, limitations, waivers, release risks, and recovery plans.\n8. Review firmware lessons learned and ensure preventive actions are institutionalized in architecture rules, coding standards, tests, or release processes.\n9. Consolidating development updates across all departmental projects to provide the Manager with regular, comprehensive reports on coding milestones and bug resolution progress.\n\nOutstanding\n1. Deliver committed firmware gates on time with no critical governance gap, uncontrolled release, or avoidable escalation.\n2. Resolve a major cross-platform or cross-domain risk through a documented decision, recovery plan, and verified closure.\n3. Introduce a reusable platform, tool, automation, or governance mechanism with measurable quality, cycle-time, or resource benefit.\n4. Develop FW Leaders and engineers so they can independently own architecture reviews, issue closure, and release evidence.",
    },
  },
};

export const COMMON_KPI_REFERENCES = {
  junior: "",
  senior:
    "個人\n1. Schematic design\n2. L10 connection review\n3. Design file(sch & Layout) review\n4. L6 / L10 System level bug fix w/ MFG & function.\n5. PCBA level bug fix w/ MFG & function.\n6. 獨立與function 協調,fix 問題或是讓事情可以進展下去\n7. 可以獨立詢問NV 問題,並fix 問題\n工作績效\n-是否達成既定目標（KPI / OKR）\n-工作品質、準確度、效率\n-完成任務的主動性與可靠度\n-問題解決與分析能力\n工作態度\n-耐心、責任感、投入度\n-是否願意接受挑戰與壓力\n-對公司政策的態度與遵循度",
  leader:
    "個人\n1. Schematic design\n2. L10 connection review\n3. Design file(sch & Layout) review\n4. L6 / L10 System level bug fix w/MFG & function team.\n5. Work with DM to provide proposal or new solution survey.\n6. 協助team member 解決 design 問題\n7. 獨立與function 協調,fix 問題或是讓事情可以進展下去\n8. 可以獨立詢問NV 問題,並fix 問題\n工作績效\n-是否達成既定目標（KPI / OKR）\n-工作品質、準確度、效率\n-完成任務的主動性與可靠度\n-問題解決與分析能力\n工作態度\n-耐心、責任感、投入度\n-是否願意接受挑戰與壓力\n-對公司政策的態度與遵循度",
  manager:
    "個人\n1. Work with PM to come out schedule\n2. Review L10 connection\n3. Co-work with NV and discuss\n4. Manpower arrange and let all team member achieve outstanding\n5. Cross function co-work and 協調工作\n6. Proposal present to BU head \n7. Co-work with EE to prepare proposal\n8. L11 bug fix \n9. Diag tool and test study\n10. Schedule on time \n工作績效\n-是否達成既定目標（KPI / OKR）\n-工作品質、準確度、效率\n-完成任務的主動性與可靠度\n-問題解決與分析能力\n工作態度\n-耐心、責任感、投入度\n-是否願意接受挑戰與壓力\n-對公司政策的態度與遵循度",
};

export const ACCOUNTABILITY_QUESTIONS = [
  {
    id: "q1",
    number: 1,
    role: "高階管理層",
    roleGroup: "executive",
    text: "我能清晰地定義並傳達組織的使命與願景",
    dimension: "承諾 Commitment",
    source: "A21:I21",
  },
  {
    id: "q2",
    number: 2,
    role: "高階管理層",
    roleGroup: "executive",
    text: "我負責確保所有團隊朝著共同目標努力，並能有效調動資源",
    dimension: "承諾 Commitment",
    source: "A22:I22",
  },
  {
    id: "q3",
    number: 3,
    role: "高階管理層",
    roleGroup: "executive",
    text: "我願意面對艱難的決策，並承擔由此帶來的風險和結果",
    dimension: "承諾 Commitment",
    source: "A23:I23",
  },
  {
    id: "q4",
    number: 4,
    role: "高階管理層",
    roleGroup: "executive",
    text: "我主動回應股東、員工和其他利益相關者的需求與期望",
    dimension: "承諾 Commitment",
    source: "A24:I24",
  },
  {
    id: "q5",
    number: 5,
    role: "高階管理層",
    roleGroup: "executive",
    text: "我對組織的戰略目標負有最終責任，並定期檢視進展",
    dimension: "承諾 Commitment",
    source: "A25:I25",
  },
  {
    id: "q6",
    number: 6,
    role: "高階管理層",
    roleGroup: "executive",
    text: "我在組織內部建立起支持當責的文化，並且作為榜樣",
    dimension: "承諾 Commitment",
    source: "A26:I26",
  },
  {
    id: "q7",
    number: 7,
    role: "高階管理層",
    roleGroup: "executive",
    text: "我積極參與並推動關鍵變革和創新",
    dimension: "承諾 Commitment",
    source: "A27:I27",
  },
  {
    id: "q8",
    number: 8,
    role: "中階管理層",
    roleGroup: "middle",
    text: "我能清晰地解釋並確保團隊理解公司的戰略目標",
    dimension: "承諾 Commitment",
    source: "A28:I28",
  },
  {
    id: "q9",
    number: 9,
    role: "中階管理層",
    roleGroup: "middle",
    text: "我定期檢視並追蹤團隊的工作進展，確保工作目標達成",
    dimension: "負責 Responsibility",
    source: "A29:I29",
  },
  {
    id: "q10",
    number: 10,
    role: "中階管理層",
    roleGroup: "middle",
    text: "我能夠迅速識別並解決團隊中出現的問題和挑戰",
    dimension: "負責 Responsibility  // 解決問題 Problem Solving",
    source: "A30:I30",
  },
  {
    id: "q11",
    number: 11,
    role: "中階管理層",
    roleGroup: "middle",
    text: "我確保團隊成員能夠了解自己的職責，並對結果負責",
    dimension: "負責 Responsibility",
    source: "A31:I31",
  },
  {
    id: "q12",
    number: 12,
    role: "中階管理層",
    roleGroup: "middle",
    text: "我會主動為團隊成員提供支持，並幫助他們達成個人與團隊目標",
    dimension: "主動 Proactivity",
    source: "A32:I32",
  },
  {
    id: "q13",
    number: 13,
    role: "中階管理層",
    roleGroup: "middle",
    text: "我會在遇到挑戰時，向上級反映實際情況並尋求指導與支援",
    dimension: "主動 Proactivity",
    source: "A33:I33",
  },
  {
    id: "q14",
    number: 14,
    role: "中階管理層",
    roleGroup: "middle",
    text: "我能激勵團隊保持高效運作，並保持高水平的合作精神",
    dimension: "協作 Collaboration",
    source: "A34:I34",
  },
  {
    id: "q15",
    number: 15,
    role: "一般員工",
    roleGroup: "employee",
    text: "我能夠清晰了解自己的工作職責並對其負責",
    dimension: "負責 Responsibility",
    source: "A35:I35",
  },
  {
    id: "q16",
    number: 16,
    role: "一般員工",
    roleGroup: "employee",
    text: "我會按時完成工作並保證結果的質量",
    dimension: "負責 Responsibility",
    source: "A36:I36",
  },
  {
    id: "q17",
    number: 17,
    role: "一般員工",
    roleGroup: "employee",
    text: "我會在遇到問題時積極尋找解決方案而不是單純抱怨",
    dimension: "主動 Proactivity  解決問題 Problem Solving",
    source: "A37:I37",
  },
  {
    id: "q18",
    number: 18,
    role: "一般員工",
    roleGroup: "employee",
    text: "我能夠主動報告進度，並在需要時及時向上級反饋工作情況",
    dimension: "主動 Proactivity",
    source: "A38:I38",
  },
  {
    id: "q19",
    number: 19,
    role: "一般員工",
    roleGroup: "employee",
    text: "我願意在工作中多做一點，協助同事完成目標或處理突發狀況",
    dimension: "主動 Proactivity",
    source: "A39:I39",
  },
  {
    id: "q20",
    number: 20,
    role: "一般員工",
    roleGroup: "employee",
    text: "我願意承認自己的錯誤，並積極學習以避免再次發生",
    dimension: "負責 Responsibility",
    source: "A40:I40",
  },
  {
    id: "q21",
    number: 21,
    role: "一般員工",
    roleGroup: "employee",
    text: "我會主動關心團隊其他成員的需求並協助他們達成共同目標",
    dimension: "協作 Collaboration",
    source: "A41:I41",
  },
];

export const ACCOUNTABILITY_ROLES = [
  {
    value: "executive",
    label: "高階管理層",
    orgLevel: "director",
  },
  {
    value: "middle",
    label: "中階管理層",
    orgLevel: "section_chief",
  },
  {
    value: "employee",
    label: "一般員工",
    orgLevel: "member",
  },
];

export const RATING_SCALE = [
  {
    value: 1,
    label: "1分（完全未做到）",
  },
  {
    value: 2,
    label: "2分（部分做到）",
  },
  {
    value: 3,
    label: "3分（基本做到）",
  },
  {
    value: 4,
    label: "4分（做得不錯）",
  },
  {
    value: 5,
    label: "5分（完全做到）",
  },
];
export const getLevelWeights = (grade) => {
  const match = WEIGHT_GROUPS.find((group) =>
    group.grades.includes(Number(grade)),
  );
  return match ? { KPI: match.KPI, OKR: match.OKR, IDP: match.IDP } : null;
};
export const getKpiReference = (team, level) =>
  KPI_REFERENCES[team]?.[level] || null;
export const getAccountabilityQuestions = (roleGroup) =>
  ACCOUNTABILITY_QUESTIONS.filter(
    (question) => question.roleGroup === roleGroup,
  );
export const getAccountabilityRole = (orgLevel) =>
  ACCOUNTABILITY_ROLES.find((role) => role.orgLevel === orgLevel)?.value || "";
