/* 2021～2025年度の公式問題の分野配分を基にした学習優先度。将来の出題を保証するものではありません。 */
window.GYOPASS_ADMIN_TREND = (() => {
  const official = 'https://gyosei-shiken.or.jp/doc/exam/index.html';
  const years = [2021, 2022, 2023, 2024, 2025];
  const priorities = {
    'admin-litigation': { rank: 1, level: 'S', label: '最重要', score: 100, forecast: '年3問前後', reason: '処分性・原告適格・執行停止・訴訟類型を横断して問いやすい' },
    'admin-remedies': { rank: 2, level: 'S', label: '最重要', score: 98, forecast: '年3問前後', reason: '期間・審理員・裁決・執行停止が毎年型を変えて問われる' },
    'admin-procedure': { rank: 3, level: 'S', label: '最重要', score: 96, forecast: '年3問前後', reason: '申請、不利益処分、行政指導、届出の比較問題を作りやすい' },
    'admin-act': { rank: 4, level: 'S', label: '最重要', score: 94, forecast: '年3問前後', reason: '効力・瑕疵・附款・裁量が行政法全体の土台になる' },
    'admin-local': { rank: 5, level: 'S', label: '最重要', score: 92, forecast: '年3問前後', reason: '住民監査・住民訴訟・議会と長が継続出題される' },
    'admin-principles': { rank: 6, level: 'A', label: '重要', score: 82, forecast: '年2問前後', reason: '法律の留保、行政組織、強制執行は他分野との横断で出る' },
    'admin-state-liability': { rank: 7, level: 'A', label: '重要', score: 80, forecast: '年2問前後', reason: '1条と2条の要件比較、求償、営造物の瑕疵が中心になる' }
  };
  const trend = scope => ({ scope, years, sourceUrl: official });

  const ox = [
    { id:'t501', lessonId:'admin-litigation', text:'取消訴訟の対象となる処分性は、公権力の主体たる国または公共団体の行為のうち、国民の権利義務を直接形成し、またはその範囲を確定することが法律上認められている行為かを中心に判断する。', answer:true, explanation:'正しい。形式的な名称だけでなく、法的効果や権利救済の必要性を踏まえて処分性を判断します。', scope:'行政事件訴訟法・処分性' },
    { id:'t502', lessonId:'admin-litigation', text:'処分または裁決を取り消す判決の効力は、訴訟の当事者にだけ及び、第三者には一切及ばない。', answer:false, explanation:'誤り。取消判決は第三者に対しても効力を有します。行政庁等を拘束する効力とも区別します。', scope:'行政事件訴訟法・取消判決の効力' },
    { id:'t507', lessonId:'admin-act', text:'行政行為の瑕疵は、後から要件が整えば、瑕疵の性質や相手方の利益を問わず常に治癒される。', answer:false, explanation:'誤り。瑕疵の治癒は常に認められるものではなく、手続保障や相手方の利益を害しないかなどを検討します。', scope:'行政行為・瑕疵の治癒' },
    { id:'t509', lessonId:'admin-local', text:'地方公共団体の議会が長の不信任議決をした場合、長は通知を受けた日から10日以内に議会を解散することができる。', answer:true, explanation:'正しい。解散しないとき、または解散後の議会が再び不信任を議決したときの効果も確認します。', scope:'地方自治法・議会と長' }
  ].map(question => ({ ...question, subject:'administrative', type:'ox', predicted:true, trend:trend(question.scope) }));

  const five = [
    { id:'t503', lessonId:'admin-litigation', text:'取消訴訟の原告適格に関する次の記述のうち、正しいものはどれか。', options:['事実上の関心があれば誰にでも認められる。','処分の名あて人以外には絶対に認められない。','処分の効果が期間経過でなくなった後でも、取消しによって回復すべき法律上の利益があれば認められ得る。','根拠法令と関係法令の趣旨は考慮できない。','裁判所は法律上保護された利益を考慮できない。'], answer:2, explanation:'処分の効果がなくなった後でも、取消しにより回復すべき法律上の利益があれば原告適格が認められ得ます。', scope:'行政事件訴訟法・原告適格' },
    { id:'t504', lessonId:'admin-litigation', text:'取消訴訟における執行停止に関する次の記述のうち、正しいものはどれか。', options:['訴えの提起だけで当然に停止する。','裁判所は申立てがなくても必ず停止する。','重大な損害を避けるため緊急の必要があるとき、裁判所は申立てにより停止できる。','本案に理由がないとみえる場合でも必ず停止する。','公共の福祉への重大な影響は考慮しない。'], answer:2, explanation:'重大な損害を避けるため緊急の必要があることなどが執行停止の要件です。', scope:'行政事件訴訟法・執行停止' },
    { id:'t508', lessonId:'admin-act', text:'行政行為の附款に関する次の記述のうち、正しいものはどれか。', options:['条件は相手方に作為義務を課す附款である。','期限は到来するか不確実な事実にかからせる附款である。','負担は相手方に作為・不作為・給付の義務を課す附款である。','撤回権の留保は行政行為の効果の一部を除外する附款である。','行政庁はすべての行政行為に自由に附款を付せる。'], answer:2, explanation:'負担は、主たる行政行為に付加して相手方へ義務を課す附款です。', scope:'行政行為・附款' },
    { id:'t510', lessonId:'admin-local', text:'地方自治法上の住民制度に関する次の記述のうち、正しいものはどれか。', options:['条例制定改廃請求には原則として有権者の3分の1以上の連署が必要である。','監査請求には原則として有権者の3分の1以上の連署が必要である。','議会の解散請求には原則として有権者の3分の1以上の連署が必要である。','住民訴訟は監査請求を経ず直ちに提起できる。','住民監査請求は違法な行為だけを対象とし、不当な行為を含まない。'], answer:2, explanation:'議会の解散請求は原則として有権者の3分の1以上の連署を要します。人口規模による特例にも注意します。', scope:'地方自治法・直接請求' }
  ].map(question => ({ ...question, subject:'administrative', type:'five', predicted:true, trend:trend(question.scope) }));

  const multi = [{
    id:'t505', subject:'administrative', lessonId:'admin-litigation', title:'取消訴訟の入口',
    text:'空欄A〜Dに入る語句を順番に選んでください。\n取消訴訟は取消しを求めるにつき［A］を有する者が、知った日から原則［B］以内、処分の日から原則［C］以内に提起する。提起しても執行は原則［D］。',
    words:['法律上の利益','事実上の関心','6か月','3か月','1年','5年','停止する','停止しない'],
    answer:['法律上の利益','6か月','1年','停止しない'], explanation:'原告適格、主観的期間、客観的期間、執行不停止を一続きで整理します。', predicted:true, trend:trend('行政事件訴訟法・取消訴訟')
  }];

  const written = [
    { id:'t506', subject:'administrative', lessonId:'admin-litigation', title:'取消訴訟の執行停止', prompt:'取消訴訟で執行停止が認められるための中心的な要件を、40字程度で記述してください。', model:'重大な損害を避けるため緊急の必要があり、本案に理由がないとみえないこと。', points:['重大な損害','緊急の必要','本案に理由がないとみえない'], explanation:'積極要件と消極要件を短くつなげます。公共の福祉への重大な影響も確認します。', predicted:true, trend:trend('行政事件訴訟法・執行停止') },
    { id:'t511', subject:'administrative', lessonId:'admin-principles', title:'権限の委任と代理', prompt:'行政機関の権限の委任と代理の違いを、権限の帰属と名義に触れて40字程度で記述してください。', model:'委任では権限が受任機関へ移り、代理では権限は本人に残り本人名で行使する。', points:['委任では権限が移る','代理では本人に残る','本人名'], explanation:'外部に対する権限の所在が変わるかを中心に書きます。', predicted:true, trend:trend('行政組織・権限') }
  ];

  return { version:'0.5.0', targetAdminQuestions:95, priorities, ox, five, multi, written };
})();
