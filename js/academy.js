// MIZANE — Académie locale bilingue, utilisable hors connexion.
import { matchesBoussoleQuery, normalizeBoussoleQuery } from "./boussole-search.js";
const COURSES = [
  {
    id:"start", title:["Initiation à MIZANE","التعريف بميزان"], description:["Comprendre l'environnement, la navigation et les principes de travail.","فهم بيئة العمل والتنقل ومبادئ الاستخدام."],
    lessons:[
      ["Découvrir l'espace de travail","اكتشاف مساحة العمل","MIZANE regroupe les fonctions comptables, commerciales et de pilotage dans un espace organisé. Commencez par vérifier l'entreprise active, le pays, la devise et l'exercice avant toute saisie.","يجمع ميزان الوظائف المحاسبية والتجارية والقيادية في مساحة منظمة. تحقق من المؤسسة النشطة والبلد والعملة والسنة المالية قبل أي إدخال."],
      ["Naviguer dans les rubriques","التنقل بين الأقسام","La navigation ouvre les modules. Le tableau de bord donne une vue synthétique ; les rubriques spécialisées servent à saisir, contrôler et consulter les opérations.","يفتح شريط التنقل الوحدات المختلفة. تقدم لوحة التحكم ملخصاً عاماً، بينما تتيح الأقسام المتخصصة إدخال العمليات ومراجعتها والاستعلام عنها."],
      ["Adopter une méthode fiable","اتباع منهج عمل موثوق","Travaillez dans l'ordre : préparer les pièces, saisir, contrôler, valider puis consulter les états. Ne confondez jamais une démonstration fictive avec les données réelles.","اعمل بالترتيب: جهز المستندات، ثم أدخل البيانات وراجعها واعتمدها وبعد ذلك افحص القوائم. لا تخلط أبداً بين بيانات العرض الافتراضية والبيانات الحقيقية."]
    ],
    quiz:[
      ["Que faut-il vérifier avant une première saisie ?","ما الذي ينبغي التحقق منه قبل أول إدخال؟",[["L'entreprise, le pays, la devise et l'exercice","المؤسسة والبلد والعملة والسنة المالية"],["La couleur de l'écran","لون الشاشة"],["Le nombre d'onglets ouverts","عدد علامات التبويب المفتوحة"]],0,["Ces paramètres déterminent le contexte de travail et les règles proposées.","تحدد هذه الإعدادات سياق العمل والقواعد المقترحة."]],
      ["Quel ordre de travail est le plus sûr ?","ما الترتيب الأكثر أماناً للعمل؟",[["Valider puis chercher les pièces","الاعتماد ثم البحث عن المستندات"],["Préparer, saisir, contrôler, valider","التحضير ثم الإدخال والمراجعة والاعتماد"],["Exporter sans vérifier","التصدير دون مراجعة"]],1,["La préparation et le contrôle précèdent la validation.","يسبق التحضير والمراجعة عملية الاعتماد."]]
    ]
  },
  {
    id:"company", title:["Configuration de l'entreprise","إعداد المؤسسة"], description:["Paramétrer le contexte comptable et protéger l'espace professionnel.","ضبط السياق المحاسبي وحماية مساحة المؤسسة."],
    lessons:[
      ["Identité et juridiction","هوية المؤسسة والاختصاص","Renseignez la dénomination, le pays et les coordonnées de référence. Le pays oriente le référentiel proposé ; il ne remplace pas la vérification de la réglementation applicable.","أدخل اسم المؤسسة والبلد وبياناتها المرجعية. يوجه البلد الدليل المقترح، لكنه لا يغني عن التحقق من التشريعات المعمول بها."],
      ["Exercice et devise","السنة المالية والعملة","Contrôlez les dates de début et de fin de l'exercice, la devise de tenue et les paramètres de conversion. Une comparaison n'est pertinente que si ses périodes et monnaies sont cohérentes.","تحقق من تاريخي بداية ونهاية السنة المالية وعملة التسجيل وإعدادات التحويل. لا تكون المقارنة سليمة إلا عند توافق الفترات والعملات."],
      ["Accès et responsabilités","الصلاحيات والمسؤوليات","Attribuez les rôles selon les responsabilités réelles. Le principe du moindre privilège limite chaque utilisateur aux actions nécessaires ; un profil de lecture ne doit pas recevoir des droits de saisie.","امنح الأدوار وفق المسؤوليات الفعلية. يحد مبدأ الحد الأدنى من الصلاحيات كل مستخدم في الأعمال اللازمة، ولا ينبغي منح ملف القراءة صلاحيات الإدخال."]
    ],
    quiz:[
      ["Le pays configuré sert principalement à…","يستخدم البلد المحدد أساساً من أجل…",[["Orienter le référentiel et le contexte réglementaire","توجيه الدليل والسياق التنظيمي"],["Déterminer la couleur du tableau de bord","تحديد لون لوحة التحكم"],["Créer automatiquement des écritures","إنشاء قيود تلقائياً"]],0,["Le pays aide à proposer le cadre adapté, qui doit être vérifié.","يساعد البلد في اقتراح الإطار المناسب الذي يجب التحقق منه."]],
      ["Quel principe doit guider l'attribution des rôles ?","ما المبدأ الذي ينبغي أن يحكم منح الأدوار؟",[["Tous les droits pour tous","منح جميع الصلاحيات للجميع"],["Le moindre privilège","الحد الأدنى من الصلاحيات"],["Un seul compte partagé","حساب واحد مشترك"]],1,["Chaque profil reçoit uniquement les droits nécessaires à sa mission.","يحصل كل ملف على الصلاحيات اللازمة لمهمته فقط."]]
    ]
  },
  {
    id:"accounting", title:["Comptabilité générale","المحاسبة العامة"], description:["Maîtriser les pièces, journaux, écritures et contrôles fondamentaux.","إتقان المستندات واليوميات والقيود والضوابط الأساسية."],
    lessons:[
      ["Préparer une pièce","إعداد المستند المؤيد","Une écriture doit reposer sur une pièce identifiable : facture, reçu, relevé ou document interne autorisé. Relevez sa date, sa référence, son tiers et son montant avant la saisie.","ينبغي أن يستند القيد إلى مستند محدد: فاتورة أو إيصال أو كشف أو وثيقة داخلية معتمدة. سجل التاريخ والمرجع والطرف والمبلغ قبل الإدخال."],
      ["Construire une écriture","إنشاء القيد","Choisissez le journal et les comptes adaptés, puis renseignez les libellés et les montants. Le total des débits doit être égal au total des crédits ; contrôlez aussi la période et la pièce liée.","اختر اليومية والحسابات المناسبة، ثم أدخل البيانات والمبالغ. يجب أن يساوي مجموع المدين مجموع الدائن، مع مراجعة الفترة والمستند المرتبط."],
      ["Contrôler et consulter","المراجعة والاستعلام","Après validation, consultez le journal, le grand livre et la balance. Recherchez les comptes d'attente, les soldes inhabituels, les doublons et les pièces manquantes avant de produire les états.","بعد الاعتماد، راجع اليومية ودفتر الأستاذ وميزان المراجعة. ابحث عن الحسابات المؤقتة والأرصدة غير المعتادة والتكرار والمستندات الناقصة قبل إعداد القوائم."]
    ],
    quiz:[
      ["Quelle égalité doit respecter une écriture équilibrée ?","ما المساواة التي يجب أن يحترمها القيد المتوازن؟",[["Débit = crédit","المدين = الدائن"],["Actif = chiffre d'affaires","الأصول = رقم المعاملات"],["TVA = résultat","الضريبة = النتيجة"]],0,["L'égalité des débits et des crédits est le contrôle élémentaire d'équilibre.","تساوي المدين والدائن هو الضابط الأساسي لتوازن القيد."]],
      ["Quel document justifie normalement une opération ?","ما الوثيقة التي تبرر العملية عادة؟",[["Une pièce identifiable","مستند محدد"],["Une supposition","افتراض"],["Un commentaire oral non tracé","تعليق شفهي غير موثق"]],0,["La traçabilité exige une pièce conservée et identifiable.","تتطلب إمكانية التتبع مستنداً محفوظاً وقابلاً للتحديد."]]
    ]
  },
  {
    id:"commercial", title:["Gestion commerciale","التسيير التجاري"], description:["Suivre clients, fournisseurs, ventes, achats et pièces commerciales.","متابعة العملاء والموردين والمبيعات والمشتريات والمستندات التجارية."],
    lessons:[
      ["Identifier les tiers","تحديد الأطراف","Créez ou sélectionnez le bon client ou fournisseur. Vérifiez la dénomination, les coordonnées, les références fiscales utiles et les comptes collectifs associés.","أنشئ أو اختر العميل أو المورد الصحيح. تحقق من الاسم وبيانات الاتصال والمراجع الضريبية اللازمة والحسابات الجماعية المرتبطة."],
      ["Contrôler factures et achats","مراجعة الفواتير والمشتريات","Avant validation, vérifiez les lignes, quantités, prix unitaires, remises, taxes, devise, échéances et pièces jointes. Distinguez brouillon, document validé, avoir et règlement.","قبل الاعتماد، راجع البنود والكميات والأسعار الفردية والتخفيضات والضرائب والعملة والاستحقاقات والمرفقات. ميز بين المسودة والمستند المعتمد والإشعار الدائن والتسوية."],
      ["Relier commerce et comptabilité","ربط التجارة بالمحاسبة","Contrôlez les écritures générées, les comptes de tiers et les éventuels mouvements de stock. Une facture commerciale ne prouve pas à elle seule le paiement ni la livraison.","راجع القيود الناتجة وحسابات الأطراف وحركات المخزون المحتملة. لا تثبت الفاتورة التجارية وحدها الدفع أو التسليم."]
    ],
    quiz:[
      ["Avant de valider une facture, il faut notamment vérifier…","قبل اعتماد الفاتورة ينبغي خصوصاً مراجعة…",[["Les quantités et prix unitaires","الكميات والأسعار الفردية"],["Uniquement le titre","العنوان فقط"],["Seulement la couleur du document","لون المستند فقط"]],0,["Les lignes et leurs paramètres conditionnent les montants et taxes.","تحدد البنود وإعداداتها المبالغ والضرائب."]],
      ["Une facture émise prouve-t-elle automatiquement le paiement ?","هل تثبت الفاتورة الصادرة الدفع تلقائياً؟",[["Oui, toujours","نعم دائماً"],["Non, le règlement doit être suivi séparément","لا، يجب تتبع التسوية بشكل مستقل"],["Seulement si elle est imprimée","فقط إذا طبعت"]],1,["Facturation et encaissement sont deux événements distincts.","الفوترة والتحصيل حدثان منفصلان."]
      ]
    ]
  },
  {
    id:"stock", title:["Gestion des stocks","إدارة المخزون"], description:["Comprendre les articles, dépôts, mouvements, réservations et inventaires.","فهم الأصناف والمستودعات والحركات والحجوزات والجرد."],
    lessons:[
      ["Configurer les articles","إعداد الأصناف","Distinguez biens physiques et services. Vérifiez l'unité de base, les conversions, le dépôt et le mode de suivi : aucun, lot ou numéro de série.","ميز بين السلع المادية والخدمات. تحقق من وحدة الأساس والتحويلات والمستودع وطريقة التتبع: دون تتبع أو بالدفعة أو بالرقم التسلسلي."],
      ["Tracer les mouvements","تتبع الحركات","Les réceptions, sorties, transferts, ajustements et réservations doivent avoir une origine documentée. Vérifiez l'article, le dépôt, la quantité, l'unité et le lien avec la facture ou la commande.","يجب أن يكون للاستلامات والإخراجات والتحويلات والتعديلات والحجوزات مصدر موثق. تحقق من الصنف والمستودع والكمية والوحدة والارتباط بالفاتورة أو الطلب."],
      ["Inventorier et valoriser","الجرد والتقييم","Comparez le comptage physique au stock théorique, expliquez chaque écart et faites approuver les ajustements. Vérifiez la méthode de valorisation et les couches FIFO ou le coût moyen selon le paramétrage.","قارن الجرد الفعلي بالمخزون النظري، وفسر كل فرق واعتمد التسويات. تحقق من طريقة التقييم وطبقات الوارد أولاً صادر أولاً أو متوسط التكلفة وفق الإعداد."]
    ],
    quiz:[
      ["Un article suivi par numéro de série exige…","الصنف المتتبع بالرقم التسلسلي يتطلب…",[["Un identifiant individuel traçable","معرفاً فردياً قابلاً للتتبع"],["Une quantité globale uniquement","كمية إجمالية فقط"],["Aucun contrôle supplémentaire","دون أي مراقبة إضافية"]],0,["Chaque unité suivie doit conserver son identité et son historique.","يجب أن تحتفظ كل وحدة متتبعة بهويتها وسجلها."]],
      ["Que faire d'un écart d'inventaire ?","ماذا نفعل عند وجود فرق في الجرد؟",[["Le corriger sans justificatif","تصحيحه دون مستند"],["L'expliquer et le faire approuver","تفسيره واعتماده"],["L'ignorer systématiquement","تجاهله دائماً"]],1,["Un écart doit être documenté avant tout ajustement.","يجب توثيق الفرق قبل أي تسوية."]
      ]
    ]
  },
  {
    id:"treasury", title:["Trésorerie et rapprochements","الخزينة والتسويات"], description:["Suivre les flux financiers, échéances, banques et prévisions.","متابعة التدفقات المالية والاستحقاقات والبنوك والتوقعات."],
    lessons:[
      ["Suivre les encaissements et décaissements","متابعة المقبوضات والمدفوعات","Enregistrez chaque règlement avec sa date, son moyen, sa référence et son affectation. Distinguez paiement partiel, avance, remboursement et compensation.","سجل كل تسوية بتاريخها ووسيلتها ومرجعها وتخصيصها. ميز بين الدفع الجزئي والتسبيق والاسترداد والمقاصة."],
      ["Rapprocher les relevés","مطابقة الكشوف البنكية","Importez ou consultez le relevé, identifiez les mouvements correspondants et examinez les opérations en attente. Ne forcez pas un rapprochement lorsque les dates ou montants divergent.","استورد أو راجع الكشف البنكي، وحدد الحركات المطابقة وافحص العمليات المعلقة. لا تفرض المطابقة عندما تختلف التواريخ أو المبالغ."],
      ["Prévoir les flux","توقع التدفقات","Construisez une prévision à partir des soldes disponibles, créances, dettes et échéances probables. Séparez les flux certains des estimations et mettez à jour les hypothèses.","أنشئ توقعاً انطلاقاً من الأرصدة المتاحة والذمم والديون والاستحقاقات المحتملة. افصل التدفقات المؤكدة عن التقديرات وحدّث الافتراضات."]
    ],
    quiz:[
      ["Un rapprochement bancaire doit reposer sur…","ينبغي أن تستند المطابقة البنكية إلى…",[["Des mouvements et références vérifiables","حركات ومراجع قابلة للتحقق"],["Une égalité supposée","تساوٍ مفترض"],["La date du jour uniquement","تاريخ اليوم فقط"]],0,["Le rapprochement relie les opérations comptables aux mouvements du relevé.","تربط المطابقة العمليات المحاسبية بحركات الكشف."]],
      ["Une prévision de trésorerie doit distinguer…","ينبغي أن يميز توقع الخزينة بين…",[["Les flux certains et les estimations","التدفقات المؤكدة والتقديرات"],["Les clients et les couleurs","العملاء والألوان"],["Les écritures et les utilisateurs","القيود والمستخدمين"]],0,["Les hypothèses doivent rester visibles et révisables.","يجب أن تبقى الافتراضات واضحة وقابلة للمراجعة."]
      ]
    ]
  },
  {
    id:"analytics", title:["Comptabilité analytique","المحاسبة التحليلية"], description:["Structurer axes, projets, coûts et budgets pour éclairer les décisions.","تنظيم المحاور والمشاريع والتكاليف والميزانيات لدعم القرار."],
    lessons:[
      ["Définir les axes","تحديد المحاور","Choisissez des axes utiles à la gestion : service, activité, projet, site ou centre de responsabilité. Évitez de multiplier les axes sans objectif de pilotage.","اختر محاور مفيدة للتسيير: المصلحة أو النشاط أو المشروع أو الموقع أو مركز المسؤولية. تجنب الإكثار من المحاور دون هدف قيادي."],
      ["Affecter les charges et produits","تخصيص المصاريف والإيرادات","Définissez des règles d'affectation cohérentes et documentées. Les clés de répartition doivent refléter une relation économique raisonnable et être appliquées de façon constante.","حدد قواعد تخصيص متسقة وموثقة. ينبغي أن تعكس مفاتيح التوزيع علاقة اقتصادية معقولة وأن تطبق باستمرار."],
      ["Comparer budget et réalisé","مقارنة الميزانية بالمنجز","Analysez les écarts en valeur et en pourcentage, recherchez leurs causes et distinguez effet volume, prix et calendrier. Une variation doit conduire à une explication, pas à une conclusion automatique.","حلل الفروق بالقيمة والنسبة، وابحث عن أسبابها وميز أثر الحجم والسعر والتوقيت. ينبغي أن يؤدي التغير إلى تفسير لا إلى استنتاج آلي."]
    ],
    quiz:[
      ["Un axe analytique doit être choisi selon…","ينبغي اختيار المحور التحليلي وفقاً لـ…",[["Un besoin réel de pilotage","حاجة فعلية للقيادة"],["Le nombre maximal de champs","أقصى عدد من الحقول"],["Une préférence esthétique","تفضيل شكلي"]],0,["Un axe utile éclaire une décision ou une responsabilité.","يساعد المحور المفيد على توضيح قرار أو مسؤولية."]],
      ["L'analyse d'un écart doit commencer par…","ينبغي أن يبدأ تحليل الفرق بـ…",[["La recherche de ses causes","البحث عن أسبابه"],["Une sanction immédiate","عقوبة فورية"],["La suppression de la donnée","حذف البيانات"]],0,["Il faut comprendre les facteurs avant de conclure.","يجب فهم العوامل قبل الاستنتاج."]
      ]
    ]
  },
  {
    id:"management", title:["Pilotage financier","القيادة المالية"], description:["Lire les états, indicateurs, marges, budgets et besoins de financement.","قراءة القوائم والمؤشرات والهوامش والميزانيات واحتياجات التمويل."],
    lessons:[
      ["Lire les états financiers","قراءة القوائم المالية","Le bilan présente une situation à une date ; le compte de résultat mesure la performance sur une période. Vérifiez le référentiel, la période et la cohérence des soldes.","تعرض الميزانية الوضع في تاريخ معين، بينما يقيس حساب النتائج الأداء خلال فترة. تحقق من الدليل والفترة واتساق الأرصدة."],
      ["Comprendre les équilibres","فهم التوازنات","Le fonds de roulement, le besoin en fonds de roulement et la trésorerie nette éclairent le financement du cycle d'exploitation. Interprétez-les ensemble et dans le temps.","يوضح رأس المال العامل واحتياج رأس المال العامل وصافي الخزينة تمويل دورة الاستغلال. فسرها مجتمعة وعبر الزمن."],
      ["Transformer les chiffres en décisions","تحويل الأرقام إلى قرارات","Reliez les indicateurs à des actions : recouvrement, délais fournisseurs, maîtrise des charges, stocks ou investissements. Documentez les hypothèses et suivez les résultats.","اربط المؤشرات بإجراءات مثل التحصيل وآجال الموردين وضبط المصاريف والمخزون والاستثمارات. وثق الافتراضات وتابع النتائج."]
    ],
    quiz:[
      ["Le bilan décrit principalement…","تعرض الميزانية أساساً…",[["Une situation à une date donnée","وضعاً في تاريخ محدد"],["Les flux de toute l'année sans date","تدفقات السنة كلها دون تاريخ"],["Uniquement les ventes","المبيعات فقط"]],0,["Le bilan est un état de situation à une date de clôture ou d'arrêté.","الميزانية قائمة وضعية في تاريخ الإقفال أو التوقف."]],
      ["FR, BFR et trésorerie nette doivent être…","ينبغي أن تكون مؤشرات رأس المال العامل والاحتياج وصافي الخزينة…",[["Interprétés ensemble","مفسرة مجتمعة"],["Ignorés séparément","متجاهلة بشكل منفصل"],["Remplacés par le chiffre d'affaires","مستبدلة برقم المعاملات"]],0,["Ces indicateurs sont complémentaires pour comprendre les équilibres.","هذه المؤشرات متكاملة لفهم التوازنات."]
      ]
    ]
  },
  {
    id:"ai", title:["IA et usage responsable","الذكاء الاصطناعي والاستخدام المسؤول"], description:["Comprendre les limites, les consentements et la vérification des réponses.","فهم الحدود والموافقات والتحقق من الإجابات."],
    lessons:[
      ["Distinguer guide et IA","التمييز بين الدليل والذكاء الاصطناعي","Le guide documentaire local peut fonctionner sans IA. Un assistant génératif est un service distinct qui peut traiter des informations transmises ; son activation doit être explicite.","يمكن للدليل المحلي أن يعمل دون ذكاء اصطناعي. المساعد التوليدي خدمة مستقلة قد تعالج المعلومات المرسلة، ولذلك يجب تفعيلها بموافقة صريحة."],
      ["Protéger les données","حماية البيانات","Ne transmettez pas de données personnelles, financières ou confidentielles sans autorisation précise. Limitez le contenu au strict nécessaire et vérifiez le fournisseur, la finalité et la durée de conservation.","لا ترسل بيانات شخصية أو مالية أو سرية دون إذن محدد. اقتصر على الحد الضروري وتحقق من المزود والغرض ومدة الاحتفاظ."],
      ["Vérifier les résultats","التحقق من النتائج","Une réponse IA peut être incomplète ou erronée. Exigez des références vérifiables, confrontez les textes applicables et faites valider les décisions sensibles par une personne compétente.","قد تكون إجابة الذكاء الاصطناعي ناقصة أو خاطئة. اطلب مراجع قابلة للتحقق وقارن النصوص المعمول بها واعرض القرارات الحساسة على مختص."]
    ],
    quiz:[
      ["Le guide local nécessite-t-il un fournisseur IA ?","هل يحتاج الدليل المحلي إلى مزود ذكاء اصطناعي؟",[["Non, il peut fonctionner sans IA","لا، يمكنه العمل دون ذكاء اصطناعي"],["Oui, obligatoirement","نعم، بالضرورة"],["Uniquement la nuit","فقط ليلاً"]],0,["Le guide local et l'assistant IA sont deux fonctions distinctes.","الدليل المحلي والمساعد الذكي وظيفتان منفصلتان."]],
      ["Comment traiter une réponse IA sensible ?","كيف نتعامل مع إجابة ذكية حساسة؟",[["La vérifier avec des sources et une personne compétente","التحقق منها بالمصادر وبواسطة مختص"],["La considérer comme une décision officielle","اعتبارها قراراً رسمياً"],["La diffuser sans contrôle","نشرها دون مراجعة"]],0,["L'IA assiste ; elle ne remplace pas la vérification ni la responsabilité.","يساعد الذكاء الاصطناعي لكنه لا يعوض التحقق والمسؤولية."]
      ]
    ]
  },
  {
    id:"documents", title:["Documents et justificatifs","المستندات والوثائق المؤيدة"], description:["Classer, retrouver, protéger et rapprocher les pièces justificatives.","تصنيف المستندات المؤيدة والعثور عليها وحمايتها وربطها."],
    lessons:[
      ["Classer les pièces","تصنيف المستندات","Adoptez une nomenclature stable : exercice, journal, date, tiers et référence. Évitez les noms ambigus et conservez les originaux selon les règles applicables.","اعتمد تسمية ثابتة تشمل السنة واليومية والتاريخ والطرف والمرجع. تجنب الأسماء الغامضة واحتفظ بالأصول وفق القواعد المعمول بها."],
      ["Relier document et opération","ربط الوثيقة بالعملية","Associez chaque pièce à l'écriture ou au document commercial correspondant. Vérifiez que le lien ouvre le bon fichier et que la version est lisible.","اربط كل مستند بالقيد أو الوثيقة التجارية المقابلة. تحقق من أن الرابط يفتح الملف الصحيح وأن النسخة قابلة للقراءة."],
      ["Sécuriser et sauvegarder","تأمين المستندات ونسخها","Limitez les accès, chiffrez les sauvegardes lorsque cela est prévu et testez régulièrement la restauration. Ne supprimez pas un ancien coffre avant inventaire et rapprochement.","حدد صلاحيات الوصول وشفر النسخ الاحتياطية عند توفر ذلك واختبر الاستعادة بانتظام. لا تحذف خزنة قديمة قبل جردها ومطابقتها."]
    ],
    quiz:[
      ["Une pièce justificative doit être…","ينبغي أن يكون المستند المؤيد…",[["Identifiable et reliée à l'opération","محدداً ومرتبطاً بالعملية"],["Nommée au hasard","مسمى عشوائياً"],["Stockée sans contrôle","مخزناً دون مراجعة"]],0,["Un classement stable facilite la preuve et la recherche.","يسهل التصنيف الثابت الإثبات والبحث."]],
      ["Avant de supprimer un ancien coffre, il faut…","قبل حذف خزنة قديمة ينبغي…",[["L'inventorier et rapprocher son contenu","جرد محتواها ومطابقته"],["Supprimer d'abord puis chercher","الحذف أولاً ثم البحث"],["Renommer les fichiers uniquement","إعادة تسمية الملفات فقط"]],0,["La récupération et la vérification précèdent toute suppression.","تسبق الاستعادة والمراجعة أي عملية حذف."]
      ]
    ]
  }
];

const LABELS = {
  fr:{button:"Académie",heading:"Académie MIZANE",intro:"Dix parcours pour apprendre à utiliser MIZANE et comprendre les principaux processus.",search:"Rechercher un parcours, une leçon ou un thème…",noResults:"Aucun parcours ne correspond à cette recherche.",catalog:"Parcours",progress:"Ma progression",lessons:"Leçons",start:"Ouvrir",done:"Leçon terminée",completed:"Terminé",quiz:"Évaluation",validate:"Corriger mes réponses",back:"Retour aux parcours",close:"Fermer",local:"Progression enregistrée sur cet appareil, pour cet utilisateur et cette entreprise. Elle n'est pas encore synchronisée dans le cloud.",score:"Résultat",passed:"Parcours validé",notPassed:"Continuez les leçons et réessayez.",reset:"Réinitialiser ma progression",confirm:"Réinitialiser toute la progression de l'Académie sur cet appareil ?",total:"Parcours validés",lessonTotal:"Leçons terminées",empty:"Aucune progression pour le moment.",question:"Question",right:"Bonne réponse",wrong:"Réponse incorrecte",retry:"Recommencer l'évaluation",storage:"Le stockage local est indisponible. La progression ne peut pas être enregistrée.",direction:"ltr"},
  ar:{button:"الأكاديمية",heading:"أكاديمية ميزان",intro:"عشرة مسارات للتعلم واستيعاب أهم وظائف ميزان.",search:"ابحث عن مسار أو درس أو موضوع…",noResults:"لا يوجد مسار يطابق هذا البحث.",catalog:"المسارات",progress:"تقدمي",lessons:"الدروس",start:"فتح",done:"إتمام الدرس",completed:"مكتمل",quiz:"التقييم",validate:"تصحيح الإجابات",back:"العودة إلى المسارات",close:"إغلاق",local:"يتم حفظ التقدم على هذا الجهاز لهذا المستخدم وهذه المؤسسة. لم تتم مزامنته مع السحابة بعد.",score:"النتيجة",passed:"تم اجتياز المسار",notPassed:"أكمل الدروس ثم أعد المحاولة.",reset:"إعادة ضبط التقدم",confirm:"هل تريد إعادة ضبط تقدم الأكاديمية كله على هذا الجهاز؟",total:"المسارات المجتازة",lessonTotal:"الدروس المكتملة",empty:"لا يوجد تقدم مسجل بعد.",question:"سؤال",right:"إجابة صحيحة",wrong:"إجابة غير صحيحة",retry:"إعادة التقييم",storage:"التخزين المحلي غير متاح. لا يمكن حفظ التقدم.",direction:"rtl"}
};

export const ACADEMY_COURSES = COURSES;
export const ACADEMY_COURSE_COUNT = COURSES.length;

export function searchAcademyCourses(query) {
  const value = String(query ?? "").trim();
  if (!value) return COURSES;
  return COURSES.filter(course => {
    const searchable = [
      ...course.title, ...course.description, ...course.lessons.flat(),
      ...course.quiz.flatMap(question => [question[0], question[1], ...question[2].flat(), ...question[4]])
    ].join(" ");
    return matchesBoussoleQuery(searchable, value);
  });
}

export function createEmptyAcademyProgress() {
  return {version:1,courses:{}};
}
export function normalizeAcademyProgress(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || !value.courses || typeof value.courses !== "object" || Array.isArray(value.courses)) return createEmptyAcademyProgress();
  const courses = {};
  for (const course of COURSES) {
    const entry = value.courses[course.id];
    if (!entry || typeof entry !== "object") continue;
    const completedLessons = Array.isArray(entry.completedLessons) ? [...new Set(entry.completedLessons.filter(id => course.lessons.some((lesson,index)=>String(index)===id)).map(String))] : [];
    const quizScore = Number.isInteger(entry.quizScore) && entry.quizScore >= 0 && entry.quizScore <= course.quiz.length ? entry.quizScore : null;
    courses[course.id] = {completedLessons,quizScore,completedAt:typeof entry.completedAt==="string"?entry.completedAt:null};
  }
  return {version:1,courses};
}
export function isAcademyCourseCompleted(course, entry) {
  return Boolean(entry && course.lessons.every((_lesson,index)=>entry.completedLessons?.includes(String(index))) && entry.quizScore !== null && entry.quizScore >= Math.ceil(course.quiz.length * 0.7));
}
export function getAcademyScopeKey(userId, companyId) {
  const user = String(userId || "device").slice(0,180);
  const company = String(companyId || "local").slice(0,180);
  return "mizane_academy_progress_v1_" + encodeURIComponent(user) + "_" + encodeURIComponent(company);
}

function readProgress(key) {
  try { return normalizeAcademyProgress(JSON.parse(localStorage.getItem(key) || "null")); }
  catch { return createEmptyAcademyProgress(); }
}
function writeProgress(key, progress) {
  try { localStorage.setItem(key,JSON.stringify(progress)); return true; }
  catch { return false; }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

export function initAcademy() {
  const toggle = document.getElementById("academy-toggle");
  if (!toggle || toggle.dataset.initialized === "true") return;
  toggle.dataset.initialized = "true";
  const dialog = document.createElement("dialog");
  dialog.id = "academy-dialog";
  dialog.className = "academy-dialog";
  dialog.innerHTML = '<div class="academy-shell"><header class="academy-header"><div><p class="academy-eyebrow">MIZANE</p><h2 class="academy-heading"></h2></div><button type="button" class="secondary small" data-academy-close aria-label="Fermer">×</button></header><div class="academy-body" id="academy-body"></div><p class="academy-local"></p></div>';
  document.body.append(dialog);
  const style = document.createElement("style");
  style.textContent = `
    .academy-dialog{border:0;border-radius:16px;padding:0;width:min(920px,94vw);max-width:920px;max-height:88vh;background:var(--card);color:var(--text);box-shadow:0 18px 60px rgba(0,0,0,.28)}
    .academy-dialog::backdrop{background:rgba(15,23,42,.62)}
    .academy-shell{display:flex;flex-direction:column;max-height:88vh}
    .academy-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid var(--border)}
    .academy-header h2{margin:0;color:var(--teal-dark);font-size:1.25rem}
    .academy-eyebrow{margin:0 0 4px;color:var(--muted);font-size:.7rem;letter-spacing:.12em}
    .academy-body{padding:18px 22px;overflow:auto}
    .academy-local{margin:0;padding:12px 22px;border-top:1px solid var(--border);font-size:.78rem;color:var(--muted)}
    .academy-tabs,.academy-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
    .academy-tabs button[aria-current=true]{background:var(--teal-dark);color:white}
    .academy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
    .academy-card{border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--bg)}
    .academy-card h3{font-size:1rem;margin:0 0 8px;color:var(--teal-dark)}
    .academy-card p{font-size:.88rem;line-height:1.55;margin:0 0 12px;color:var(--text)}
    .academy-meta{font-size:.76rem;color:var(--muted);margin-bottom:10px}
    .academy-progress{height:7px;background:var(--border);border-radius:20px;overflow:hidden;margin:8px 0 12px}
    .academy-progress span{display:block;height:100%;background:var(--teal);width:0}
    .academy-lesson{border:1px solid var(--border);border-radius:10px;padding:12px;margin:10px 0;background:var(--bg)}
    .academy-lesson h3{margin:0 0 8px;font-size:.98rem}
    .academy-lesson p{line-height:1.7;margin:0 0 12px}
    .academy-quiz-question{padding:12px;border:1px solid var(--border);border-radius:10px;margin:10px 0}
    .academy-quiz-question legend{font-weight:650;padding:0 4px}
    .academy-quiz-option{display:flex;align-items:flex-start;gap:8px;margin:10px 0;font-size:.9rem}
    .academy-quiz-option input{width:auto;margin-top:3px}
    .academy-result{padding:12px;border-radius:10px;background:var(--th-bg);margin:12px 0}
    .academy-dialog [dir=rtl]{text-align:right}
    .academy-dialog button{white-space:normal}
    @media(max-width:600px){.academy-dialog{width:96vw;max-height:92vh}.academy-header,.academy-body{padding:14px}.academy-shell{max-height:92vh}.academy-grid{grid-template-columns:1fr}}
  `;
  document.head.append(style);
  const body = dialog.querySelector("#academy-body");
  const heading = dialog.querySelector(".academy-heading");
  const localNote = dialog.querySelector(".academy-local");
  let view = "catalog";
  let activeCourse = null;
  let lastResult = null;
  let catalogQuery = "";
  let progress = createEmptyAcademyProgress();
  let storageKey = "";
  const locale = () => document.documentElement.lang === "ar" ? "ar" : "fr";
  const safeGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const text = (pair) => Array.isArray(pair) ? pair[locale()==="ar"?1:0] : String(pair ?? "");
  const labels = () => LABELS[locale()];
  const entry = (course) => progress.courses[course.id] || {completedLessons:[],quizScore:null,completedAt:null};
  const save = () => { if (!writeProgress(storageKey,progress)) localNote.textContent=labels().storage; };
  const open = () => {
    storageKey=getAcademyScopeKey(safeGet("mizane_active_user_v1"),safeGet("mizane_active_company_v1"));
    progress=readProgress(storageKey);
    view="catalog";activeCourse=null;lastResult=null;catalogQuery="";
    render();
    dialog.showModal();
  };
  const progressStats = () => {
    let lessons=0,completed=0;
    for(const course of COURSES){const item=entry(course);lessons+=item.completedLessons.length;if(isAcademyCourseCompleted(course,item))completed++;}
    return {lessons,completed,totalLessons:COURSES.reduce((sum,course)=>sum+course.lessons.length,0)};
  };
  function render() {
    const l=labels();
    heading.textContent=l.heading;localNote.textContent=l.local;
    dialog.dir=l.direction;
    body.dir=l.direction;
    const stats=progressStats();
    const tabs='<div class="academy-tabs"><button type="button" data-academy-view="catalog" aria-current="'+(view==="catalog"||view==="course"||view==="quiz")+'">'+l.catalog+'</button><button type="button" data-academy-view="progress" aria-current="'+(view==="progress")+'">'+l.progress+'</button></div>';
    if(view==="catalog"){
      body.innerHTML=tabs+'<p>'+escapeHtml(l.intro)+'</p><input class="academy-search" type="search" aria-label="'+escapeHtml(l.search)+'" placeholder="'+escapeHtml(l.search)+'" value="'+escapeHtml(catalogQuery)+'" autocomplete="off" style="box-sizing:border-box;width:100%;max-width:560px;padding:11px;margin:8px 0 16px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font:inherit"><p class="academy-no-results" hidden>'+escapeHtml(l.noResults)+'</p><div class="academy-grid">'+COURSES.map(course=>{
        const item=entry(course),done=isAcademyCourseCompleted(course,item),percent=Math.round((item.completedLessons.length/course.lessons.length)*100);
        const searchable=[...course.title,...course.description,...course.lessons.flat(),...course.quiz.flatMap(question=>[question[0],question[1],...question[2].flat(),...question[4]])].join(" ");
        return '<article class="academy-card" data-academy-search="'+escapeHtml(normalizeBoussoleQuery(searchable))+'"><h3>'+escapeHtml(text(course.title))+'</h3><p>'+escapeHtml(text(course.description))+'</p><div class="academy-meta">'+item.completedLessons.length+'/'+course.lessons.length+' '+escapeHtml(l.lessons)+(done?' · '+escapeHtml(l.completed):'')+'</div><div class="academy-progress"><span style="width:'+percent+'%"></span></div><button type="button" data-academy-course="'+course.id+'">'+escapeHtml(l.start)+'</button></article>';
      }).join("")+'</div>';
      return;
    }
    if(view==="course"&&activeCourse){
      const course=activeCourse,item=entry(course);
      body.innerHTML=tabs+'<div class="academy-actions"><button type="button" class="secondary small" data-academy-view="catalog">'+escapeHtml(l.back)+'</button><button type="button" data-academy-quiz>'+escapeHtml(l.quiz)+'</button></div><h2>'+escapeHtml(text(course.title))+'</h2><div class="academy-meta">'+item.completedLessons.length+'/'+course.lessons.length+' '+escapeHtml(l.lessons)+'</div>'+course.lessons.map((lesson,index)=>{
        const done=item.completedLessons.includes(String(index));
        return '<article class="academy-lesson"><h3>'+(index+1)+'. '+escapeHtml(text([lesson[0],lesson[1]]))+'</h3><p>'+escapeHtml(text([lesson[2],lesson[3]]))+'</p><button type="button" class="'+(done?'secondary small':'')+'" data-academy-lesson="'+index+'">'+escapeHtml(done?l.completed:l.done)+'</button></article>';
      }).join("");
      return;
    }
    if(view==="quiz"&&activeCourse){
      const course=activeCourse;
      const corrections=lastResult?'<div class="academy-result" role="status">'+escapeHtml(l.score)+': '+lastResult.score+'/'+course.quiz.length+' — '+escapeHtml(lastResult.passed?l.passed:l.notPassed)+'</div>'+lastResult.answers.map(answer=>'<article class="academy-lesson"><strong>'+escapeHtml(answer.correct?l.right:l.wrong)+'</strong><p>'+escapeHtml(text(answer.explanation))+'</p></article>').join(""):'' ;
      body.innerHTML=tabs+'<div class="academy-actions"><button type="button" class="secondary small" data-academy-view="course">'+escapeHtml(l.back)+'</button></div><h2>'+escapeHtml(text(course.title))+' — '+escapeHtml(l.quiz)+'</h2><form id="academy-quiz-form">'+course.quiz.map((q,index)=>'<fieldset class="academy-quiz-question"><legend>'+escapeHtml(l.question)+' '+(index+1)+' — '+escapeHtml(text([q[0],q[1]]))+'</legend>'+q[2].map((option,optionIndex)=>'<label class="academy-quiz-option"><input type="radio" name="q'+index+'" value="'+optionIndex+'" required><span>'+escapeHtml(text(option))+'</span></label>').join("")+'</fieldset>').join("")+'<button type="submit">'+escapeHtml(lastResult?l.retry:l.validate)+'</button></form>'+corrections;
      return;
    }
    if(view==="progress"){
      const percent=Math.round((stats.lessons/Math.max(1,stats.totalLessons))*100);
      body.innerHTML=tabs+'<div class="academy-card"><h3>'+stats.completed+'/'+COURSES.length+' — '+escapeHtml(l.total)+'</h3><p>'+stats.lessons+'/'+stats.totalLessons+' '+escapeHtml(l.lessonTotal)+'</p><div class="academy-progress"><span style="width:'+percent+'%"></span></div></div><div class="academy-grid">'+COURSES.map(course=>{
        const item=entry(course),done=isAcademyCourseCompleted(course,item);
        return '<article class="academy-card"><h3>'+escapeHtml(text(course.title))+'</h3><p>'+item.completedLessons.length+'/'+course.lessons.length+' '+escapeHtml(l.lessons)+' · '+(done?escapeHtml(l.completed):escapeHtml(l.notPassed))+'</p><button type="button" data-academy-course="'+course.id+'">'+escapeHtml(l.start)+'</button></article>';
      }).join("")+'</div><div class="academy-actions" style="margin-top:16px"><button type="button" class="danger small" data-academy-reset>'+escapeHtml(l.reset)+'</button></div>';
      return;
    }
    body.innerHTML=tabs+'<p>'+escapeHtml(l.empty)+'</p>';
  }
  body.addEventListener("input",event=>{
    if(!event.target.matches(".academy-search"))return;
    catalogQuery=event.target.value;
    const query=event.target.value;
    const cards=[...body.querySelectorAll("[data-academy-search]")];
    let visible=0;
    for(const card of cards){const show=!query.trim()||matchesBoussoleQuery(card.dataset.academySearch,query);card.hidden=!show;if(show)visible++;}
    const empty=body.querySelector(".academy-no-results");
    if(empty)empty.hidden=visible!==0;
  });
  toggle.addEventListener("click",open);
  dialog.querySelector("[data-academy-close]").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("click",event=>{
    if(event.target===dialog)dialog.close();
    const button=event.target.closest("button");
    if(!button)return;
    if(button.dataset.academyView){view=button.dataset.academyView;lastResult=null;render();return;}
    if(button.dataset.academyCourse){activeCourse=COURSES.find(course=>course.id===button.dataset.academyCourse)||null;view="course";lastResult=null;render();return;}
    if(button.dataset.academyLesson!==undefined&&activeCourse){
      const item=entry(activeCourse),id=String(button.dataset.academyLesson);
      if(!item.completedLessons.includes(id))item.completedLessons.push(id);
      progress.courses[activeCourse.id]=item;save();render();return;
    }
    if(button.hasAttribute("data-academy-quiz")&&activeCourse){view="quiz";lastResult=null;render();return;}
    if(button.hasAttribute("data-academy-reset")){
      if(window.confirm(labels().confirm)){progress=createEmptyAcademyProgress();save();view="progress";render();}
    }
  });
  dialog.addEventListener("submit",event=>{
    if(event.target.id!=="academy-quiz-form"||!activeCourse)return;
    event.preventDefault();
    const form=new FormData(event.target);
    let score=0;
    const answers=activeCourse.quiz.map((question,index)=>{const correct=Number(form.get("q"+index))===question[3];if(correct)score++;return {correct,explanation:question[4]};});
    const item=entry(activeCourse);item.quizScore=score;
    const passed=item.completedLessons.length===activeCourse.lessons.length&&score>=Math.ceil(activeCourse.quiz.length*.7);
    item.completedAt=passed?new Date().toISOString():null;
    progress.courses[activeCourse.id]=item;save();
    lastResult={score,passed,answers};render();
  });
}

