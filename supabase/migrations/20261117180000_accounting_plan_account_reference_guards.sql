
-- Référentiel serveur synchronisé avec les quatre plans comptables MIZANE.
create table private.accounting_plan_accounts (
  plan_id text not null check (plan_id in ('syscohada','pcg','nct','cgnc')),
  code text not null,
  label text not null,
  account_type text not null check (account_type in ('asset','liability','equity','expense','income')),
  primary key (plan_id, code)
);

insert into private.accounting_plan_accounts(plan_id, code, label, account_type)
values
  ('syscohada','101','Capital social','equity'),
  ('syscohada','104','Primes liées au capital social','equity'),
  ('syscohada','106','Réserves','equity'),
  ('syscohada','109','Actionnaires, capital souscrit non appelé','asset'),
  ('syscohada','110','Report à nouveau (solde créditeur)','equity'),
  ('syscohada','119','Report à nouveau (solde débiteur)','asset'),
  ('syscohada','12','Résultat de l''exercice','equity'),
  ('syscohada','13','Subventions d''investissement','equity'),
  ('syscohada','14','Provisions réglementées','equity'),
  ('syscohada','15','Provisions pour risques et charges','liability'),
  ('syscohada','16','Emprunts et dettes financières','liability'),
  ('syscohada','161','Emprunts obligataires','liability'),
  ('syscohada','162','Emprunts auprès des établissements de crédit','liability'),
  ('syscohada','165','Dépôts et cautionnements reçus','liability'),
  ('syscohada','17','Dettes de crédit-bail et contrats assimilés','liability'),
  ('syscohada','18','Autres emprunts et dettes financières','liability'),
  ('syscohada','19','Fonds dédiés sur opérations en partenariat','equity'),
  ('syscohada','21','Immobilisations incorporelles','asset'),
  ('syscohada','211','Frais d''établissement','asset'),
  ('syscohada','212','Frais de recherche et développement','asset'),
  ('syscohada','213','Brevets, licences, logiciels','asset'),
  ('syscohada','218','Autres immobilisations incorporelles','asset'),
  ('syscohada','22','Terrains','asset'),
  ('syscohada','23','Constructions','asset'),
  ('syscohada','231','Bâtiments','asset'),
  ('syscohada','234','Constructions sur terrains d''autrui','asset'),
  ('syscohada','24','Installations techniques, matériel et outillage','asset'),
  ('syscohada','241','Installations techniques','asset'),
  ('syscohada','244','Matériel et outillage industriel','asset'),
  ('syscohada','245','Matériel de transport','asset'),
  ('syscohada','2455','Matériel de transport','asset'),
  ('syscohada','25','Immobilisations en cours','asset'),
  ('syscohada','27','Autres immobilisations financières','asset'),
  ('syscohada','275','Dépôts et cautionnements versés','asset'),
  ('syscohada','28','Amortissements des immobilisations','asset'),
  ('syscohada','281','Amortissements des immobilisations incorporelles','asset'),
  ('syscohada','283','Amortissements des constructions','asset'),
  ('syscohada','284','Amortissements des installations techniques','asset'),
  ('syscohada','2844','Amortissements du matériel et outillage industriel','asset'),
  ('syscohada','2845','Amortissements du matériel de transport','asset'),
  ('syscohada','29','Dépréciations des immobilisations','asset'),
  ('syscohada','31','Marchandises','asset'),
  ('syscohada','311','Marchandises A','asset'),
  ('syscohada','32','Matières premières et fournitures liées','asset'),
  ('syscohada','33','Autres approvisionnements','asset'),
  ('syscohada','34','Stocks en cours de route','asset'),
  ('syscohada','35','Services en cours','asset'),
  ('syscohada','36','Produits finis','asset'),
  ('syscohada','37','Stocks de produits intermédiaires et résiduels','asset'),
  ('syscohada','38','Stocks en cours d''acheminement','asset'),
  ('syscohada','39','Dépréciations des stocks','asset'),
  ('syscohada','401','Fournisseurs, dettes en compte','liability'),
  ('syscohada','402','Fournisseurs, effets à payer','liability'),
  ('syscohada','403','Fournisseurs, retenues de garantie','liability'),
  ('syscohada','404','Fournisseurs d''investissements','liability'),
  ('syscohada','408','Fournisseurs, factures non parvenues','liability'),
  ('syscohada','409','Fournisseurs débiteurs','asset'),
  ('syscohada','411','Clients','asset'),
  ('syscohada','412','Clients, effets à recevoir','asset'),
  ('syscohada','416','Créances clients litigieuses ou en justice','asset'),
  ('syscohada','418','Clients, produits non parvenus','asset'),
  ('syscohada','419','Clients créditeurs','liability'),
  ('syscohada','42','Personnel','liability'),
  ('syscohada','421','Personnel, avances et acomptes','asset'),
  ('syscohada','422','Personnel, rémunérations dues','liability'),
  ('syscohada','424','Personnel, dépôts de garantie','liability'),
  ('syscohada','425','Personnel, oppositions sur salaires','liability'),
  ('syscohada','428','Personnel, charges à payer et produits à recevoir','liability'),
  ('syscohada','43','Organismes sociaux','liability'),
  ('syscohada','431','Sécurité sociale','liability'),
  ('syscohada','432','Autres organismes sociaux','liability'),
  ('syscohada','433','Retraites et organismes sociaux','liability'),
  ('syscohada','438','Organismes sociaux, charges à payer et produits à recevoir','liability'),
  ('syscohada','44','État et collectivités publiques','liability'),
  ('syscohada','441','État, impôts et taxes sur rémunérations','liability'),
  ('syscohada','442','État, taxes assimilées aux rémunérations','liability'),
  ('syscohada','443','État, impôts et taxes sur rémunérations','liability'),
  ('syscohada','4431','État, TVA facturée','liability'),
  ('syscohada','4441','État, impôt sur les résultats','liability'),
  ('syscohada','445','État, TVA récupérable','asset'),
  ('syscohada','4452','État, TVA récupérable sur immobilisations','asset'),
  ('syscohada','4453','État, TVA récupérable sur achats','asset'),
  ('syscohada','446','État, taxes sur rémunérations et autres impôts','liability'),
  ('syscohada','447','État, autres impôts, taxes et contributions','liability'),
  ('syscohada','448','État, charges à payer et produits à recevoir','liability'),
  ('syscohada','45','Organismes internationaux','liability'),
  ('syscohada','451','Associés, opérations particulières','liability'),
  ('syscohada','455','Associés, comptes courants','liability'),
  ('syscohada','46','Associés et groupe','liability'),
  ('syscohada','462','Associés, comptes courants débiteurs','asset'),
  ('syscohada','467','Autres associés et groupe, comptes créditeurs','liability'),
  ('syscohada','47','Débiteurs et créditeurs divers','liability'),
  ('syscohada','471','Comptes d''attente','asset'),
  ('syscohada','472','Comptes transitoires ou d''attente','asset'),
  ('syscohada','476','Écarts de conversion — actif','asset'),
  ('syscohada','478','Gains de change à payer','liability'),
  ('syscohada','48','Créances et dettes hors activité ordinaire','asset'),
  ('syscohada','481','Charges HAO à payer','liability'),
  ('syscohada','488','Créances HAO','asset'),
  ('syscohada','49','Dépréciations des comptes de tiers','asset'),
  ('syscohada','491','Dépréciations des comptes clients','asset'),
  ('syscohada','50','Titres de placement','asset'),
  ('syscohada','52','Banques, établissements financiers et assimilés','asset'),
  ('syscohada','521','Banques','asset'),
  ('syscohada','5211','Banques locales','asset'),
  ('syscohada','5214','Banques, comptes en devises','asset'),
  ('syscohada','523','Banques, comptes de crédits de trésorerie','liability'),
  ('syscohada','53','Établissements financiers et assimilés','asset'),
  ('syscohada','54','Instruments de trésorerie','asset'),
  ('syscohada','56','Banques, instruments de trésorerie','asset'),
  ('syscohada','57','Caisse','asset'),
  ('syscohada','571','Caisse siège social','asset'),
  ('syscohada','58','Régies d''avances, accréditifs et virements internes','asset'),
  ('syscohada','59','Dépréciations et provisions pour risques à court terme','asset'),
  ('syscohada','601','Achats de marchandises','expense'),
  ('syscohada','602','Achats de matières premières et fournitures liées','expense'),
  ('syscohada','603','Variations des stocks de biens achetés','expense'),
  ('syscohada','604','Achats stockés de matières et fournitures consommables','expense'),
  ('syscohada','605','Autres achats','expense'),
  ('syscohada','6051','Fournitures non stockables (eau, énergie…)','expense'),
  ('syscohada','6052','Fournitures stockables (fournitures de bureau…)','expense'),
  ('syscohada','6054','Achats d''études et prestations de services','expense'),
  ('syscohada','6055','Achats de petit matériel et outillage','expense'),
  ('syscohada','609','Réductions de prix obtenues sur achats','income'),
  ('syscohada','61','Transports','expense'),
  ('syscohada','611','Transports sur achats','expense'),
  ('syscohada','612','Transports sur ventes','expense'),
  ('syscohada','614','Transports du personnel','expense'),
  ('syscohada','615','Transports pluriens','expense'),
  ('syscohada','62','Services extérieurs A','expense'),
  ('syscohada','621','Sous-traitance générale','expense'),
  ('syscohada','622','Locations et charges locatives','expense'),
  ('syscohada','6221','Locations de terrains et constructions','expense'),
  ('syscohada','6222','Locations de mobilier et matériel','expense'),
  ('syscohada','623','Redevances de crédit-bail et contrats assimilés','expense'),
  ('syscohada','624','Entretien, réparations et maintenance','expense'),
  ('syscohada','625','Primes d''assurance','expense'),
  ('syscohada','626','Études, recherches et documentation','expense'),
  ('syscohada','627','Publicité, publications, relations publiques','expense'),
  ('syscohada','628','Frais de télécommunications','expense'),
  ('syscohada','63','Services extérieurs B','expense'),
  ('syscohada','631','Frais bancaires','expense'),
  ('syscohada','6311','Frais sur titres','expense'),
  ('syscohada','6312','Frais sur effets','expense'),
  ('syscohada','633','Rémunérations d''intermédiaires et honoraires','expense'),
  ('syscohada','634','Transmissions entre services','expense'),
  ('syscohada','635','Rémunérations de personnel extérieur','expense'),
  ('syscohada','636','Rémunérations de personnel intérimaire','expense'),
  ('syscohada','637','Rémunérations de personnel détaché ou prêté','expense'),
  ('syscohada','638','Autres charges externes','expense'),
  ('syscohada','641','Impôts et taxes directs','expense'),
  ('syscohada','645','Impôts et taxes indirects','expense'),
  ('syscohada','646','Enregistrement, timbre et droits de douane','expense'),
  ('syscohada','651','Redevances pour concessions, brevets, licences','expense'),
  ('syscohada','652','Jetons de présence','expense'),
  ('syscohada','653','Pertes sur créances clients','expense'),
  ('syscohada','658','Charges diverses','expense'),
  ('syscohada','661','Rémunérations directes versées au personnel national','expense'),
  ('syscohada','6611','Salaires et appointements','expense'),
  ('syscohada','6612','Salaire de l''exploitant','expense'),
  ('syscohada','6613','Commissions versées au personnel','expense'),
  ('syscohada','663','Indemnités forfaitaires versées au personnel','expense'),
  ('syscohada','664','Charges sociales','expense'),
  ('syscohada','665','Charges sur autres personnels','expense'),
  ('syscohada','671','Intérêts des emprunts','expense'),
  ('syscohada','672','Intérêts dans loyers de crédit-bail','expense'),
  ('syscohada','673','Escomptes accordés','expense'),
  ('syscohada','674','Autres intérêts','expense'),
  ('syscohada','675','Pertes de change','expense'),
  ('syscohada','676','Pertes sur cessions de titres de placement','expense'),
  ('syscohada','678','Pertes sur risques financiers','expense'),
  ('syscohada','681','Dotations aux amortissements d''exploitation','expense'),
  ('syscohada','684','Dotations aux provisions pour risques et charges','expense'),
  ('syscohada','687','Dotations aux dépréciations','expense'),
  ('syscohada','81','Valeurs comptables des cessions d''immobilisations','expense'),
  ('syscohada','82','Produits des cessions d''immobilisations','income'),
  ('syscohada','83','Charges hors activités ordinaires','expense'),
  ('syscohada','84','Produits hors activités ordinaires','income'),
  ('syscohada','85','Dotations hors activités ordinaires','expense'),
  ('syscohada','86','Reprises hors activités ordinaires','income'),
  ('syscohada','88','Subventions d''équilibre','income'),
  ('syscohada','89','Impôts sur le résultat','expense'),
  ('syscohada','701','Ventes de marchandises','income'),
  ('syscohada','702','Ventes de produits finis','income'),
  ('syscohada','703','Travaux facturés','income'),
  ('syscohada','704','Études et prestations de services facturées','income'),
  ('syscohada','705','Services vendus','income'),
  ('syscohada','706','Produits accessoires','income'),
  ('syscohada','707','Produits des activités annexes','income'),
  ('syscohada','708','Autres produits d''activités','income'),
  ('syscohada','709','Réductions de prix accordées','expense'),
  ('syscohada','711','Subventions d''exploitation','income'),
  ('syscohada','712','Production immobilisée','income'),
  ('syscohada','718','Autres produits subsidiaires','income'),
  ('syscohada','72','Production stockée ou déstockée','income'),
  ('syscohada','73','Variation des stocks de biens et de services produits','income'),
  ('syscohada','751','Redevances pour concessions, brevets, licences','income'),
  ('syscohada','758','Charges transférées','income'),
  ('syscohada','771','Intérêts de prêts','income'),
  ('syscohada','772','Revenus des titres','income'),
  ('syscohada','773','Escomptes obtenus','income'),
  ('syscohada','775','Produits de change','income'),
  ('syscohada','778','Gains de change','income'),
  ('syscohada','781','Transferts de charges d''exploitation','income'),
  ('syscohada','787','Transferts de charges financières','income'),
  ('pcg','101','Capital social','equity'),
  ('pcg','104','Primes liées au capital social','equity'),
  ('pcg','106','Réserves','equity'),
  ('pcg','109','Actionnaires, capital souscrit non appelé','asset'),
  ('pcg','110','Report à nouveau (solde créditeur)','equity'),
  ('pcg','119','Report à nouveau (solde débiteur)','asset'),
  ('pcg','12','Résultat de l''exercice','equity'),
  ('pcg','13','Subventions d''investissement','equity'),
  ('pcg','14','Provisions réglementées','equity'),
  ('pcg','15','Provisions pour risques et charges','liability'),
  ('pcg','16','Emprunts et dettes assimilées','liability'),
  ('pcg','164','Emprunts auprès des établissements de crédit','liability'),
  ('pcg','165','Dépôts et cautionnements reçus','liability'),
  ('pcg','168','Autres emprunts et dettes assimilées','liability'),
  ('pcg','19','Fonds dédiés','equity'),
  ('pcg','201','Frais d''établissement','asset'),
  ('pcg','205','Concessions, brevets et licences','asset'),
  ('pcg','207','Fonds commercial','asset'),
  ('pcg','208','Autres immobilisations incorporelles','asset'),
  ('pcg','211','Terrains','asset'),
  ('pcg','213','Constructions','asset'),
  ('pcg','215','Installations techniques, matériel et outillage','asset'),
  ('pcg','218','Autres immobilisations corporelles','asset'),
  ('pcg','2183','Matériel de transport','asset'),
  ('pcg','232','Immobilisations en cours','asset'),
  ('pcg','27','Autres immobilisations financières','asset'),
  ('pcg','275','Dépôts et cautionnements versés','asset'),
  ('pcg','28','Amortissements des immobilisations','asset'),
  ('pcg','281','Amortissements des immobilisations incorporelles','asset'),
  ('pcg','282','Amortissements des immobilisations corporelles','asset'),
  ('pcg','29','Dépréciations des immobilisations','asset'),
  ('pcg','31','Matières premières','asset'),
  ('pcg','32','Autres approvisionnements','asset'),
  ('pcg','35','Stocks de produits','asset'),
  ('pcg','37','Stocks de marchandises','asset'),
  ('pcg','39','Dépréciations des stocks','asset'),
  ('pcg','401','Fournisseurs','liability'),
  ('pcg','403','Fournisseurs, effets à payer','liability'),
  ('pcg','404','Fournisseurs d''investissements','liability'),
  ('pcg','408','Fournisseurs, factures non parvenues','liability'),
  ('pcg','409','Fournisseurs débiteurs','asset'),
  ('pcg','411','Clients','asset'),
  ('pcg','413','Clients, effets à recevoir','asset'),
  ('pcg','416','Créances clients litigieuses','asset'),
  ('pcg','418','Clients, produits non parvenus','asset'),
  ('pcg','419','Clients créditeurs','liability'),
  ('pcg','421','Personnel, rémunérations dues','liability'),
  ('pcg','425','Personnel, avances et acomptes','asset'),
  ('pcg','428','Personnel, charges à payer et produits à recevoir','liability'),
  ('pcg','431','Sécurité sociale','liability'),
  ('pcg','437','Autres organismes sociaux','liability'),
  ('pcg','44','État et autres collectivités','liability'),
  ('pcg','444','État, impôt sur les bénéfices','liability'),
  ('pcg','4451','État, TVA sur ventes à décaisser','liability'),
  ('pcg','4452','État, TVA sur acquisitions','asset'),
  ('pcg','4455','État, TVA à payer','liability'),
  ('pcg','4456','État, TVA à régulariser','asset'),
  ('pcg','4457','État, TVA collectée','liability'),
  ('pcg','447','État, autres impôts, taxes et versements assimilés','liability'),
  ('pcg','455','Associés, comptes courants','liability'),
  ('pcg','46','Débiteurs divers et créditeurs divers','liability'),
  ('pcg','467','Autres débiteurs et créditeurs','liability'),
  ('pcg','471','Comptes d''attente','asset'),
  ('pcg','476','Écart de conversion — actif','asset'),
  ('pcg','478','Écart de conversion — passif','liability'),
  ('pcg','48','Créances et dettes hors activité ordinaire','asset'),
  ('pcg','491','Dépréciations des comptes de clients','asset'),
  ('pcg','50','Titres de placement','asset'),
  ('pcg','512','Banques','asset'),
  ('pcg','519','Concours bancaires courants','liability'),
  ('pcg','53','Caisse','asset'),
  ('pcg','531','Caisse siège social','asset'),
  ('pcg','58','Virements internes','asset'),
  ('pcg','601','Achats de matières premières','expense'),
  ('pcg','602','Achats d''autres approvisionnements','expense'),
  ('pcg','606','Achats non stockés de matières et fournitures','expense'),
  ('pcg','607','Achats de marchandises','expense'),
  ('pcg','608','Frais accessoires d''achat','expense'),
  ('pcg','609','Rabais, remises et ristournes obtenus sur achats','income'),
  ('pcg','61','Services extérieurs','expense'),
  ('pcg','611','Sous-traitance générale','expense'),
  ('pcg','612','Redevances de crédit-bail','expense'),
  ('pcg','613','Locations','expense'),
  ('pcg','614','Charges locatives et de copropriété','expense'),
  ('pcg','615','Entretien et réparations','expense'),
  ('pcg','616','Primes d''assurance','expense'),
  ('pcg','617','Études et recherches','expense'),
  ('pcg','618','Divers','expense'),
  ('pcg','62','Autres services extérieurs','expense'),
  ('pcg','621','Personnel extérieur à l''entreprise','expense'),
  ('pcg','622','Rémunérations d''intermédiaires et honoraires','expense'),
  ('pcg','623','Publicité, publications, relations publiques','expense'),
  ('pcg','624','Transports de biens et transports collectifs du personnel','expense'),
  ('pcg','625','Déplacements, missions et réceptions','expense'),
  ('pcg','626','Frais postaux et frais de télécommunications','expense'),
  ('pcg','627','Services bancaires','expense'),
  ('pcg','628','Divers','expense'),
  ('pcg','63','Impôts, taxes et versements assimilés','expense'),
  ('pcg','641','Impôts et taxes sur rémunérations','expense'),
  ('pcg','644','Droits d''enregistrement et de timbre','expense'),
  ('pcg','645','Taxes sur les salaires','expense'),
  ('pcg','651','Redevances pour concessions, brevets, licences','expense'),
  ('pcg','653','Jetons de présence','expense'),
  ('pcg','654','Pertes sur créances irrécouvrables','expense'),
  ('pcg','658','Charges diverses de gestion courante','expense'),
  ('pcg','66','Charges de personnel','expense'),
  ('pcg','661','Rémunérations du personnel','expense'),
  ('pcg','662','Rémunérations d''intermédiaires','expense'),
  ('pcg','664','Rémunérations du personnel de l''entreprise','expense'),
  ('pcg','665','Rémunérations du personnel extérieur','expense'),
  ('pcg','666','Indemnités du personnel','expense'),
  ('pcg','667','Médecine du travail et pharmacie','expense'),
  ('pcg','668','Autres charges de personnel','expense'),
  ('pcg','671','Intérêts des emprunts et dettes','expense'),
  ('pcg','675','Charges nettes sur cessions d''éléments d''actif','expense'),
  ('pcg','676','Pertes sur cessions de valeurs mobilières','expense'),
  ('pcg','678','Autres charges financières','expense'),
  ('pcg','6788','Charges financières diverses','expense'),
  ('pcg','681','Dotations aux amortissements','expense'),
  ('pcg','687','Dotations aux dépréciations','expense'),
  ('pcg','691','Participation des salariés aux résultats','expense'),
  ('pcg','696','Suppléments de réduction d''impôt','expense'),
  ('pcg','701','Ventes de produits finis','income'),
  ('pcg','702','Ventes de produits intermédiaires','income'),
  ('pcg','704','Travaux','income'),
  ('pcg','705','Études','income'),
  ('pcg','706','Prestations de services','income'),
  ('pcg','707','Ventes de marchandises','income'),
  ('pcg','708','Produits des activités annexes','income'),
  ('pcg','709','Rabais, remises et ristournes accordés','expense'),
  ('pcg','711','Subventions d''exploitation','income'),
  ('pcg','712','Production immobilisée','income'),
  ('pcg','713','Variation des stocks','income'),
  ('pcg','721','Concessions, brevets et licences cédés','income'),
  ('pcg','751','Redevances pour concessions, brevets et licences','income'),
  ('pcg','752','Revenus des immeubles non affectés','income'),
  ('pcg','758','Produits divers de gestion courante','income'),
  ('pcg','761','Produits de participations','income'),
  ('pcg','762','Produits des autres immobilisations financières','income'),
  ('pcg','764','Revenus des valeurs mobilières de placement','income'),
  ('pcg','765','Escomptes obtenus','income'),
  ('pcg','766','Gains de change','income'),
  ('pcg','768','Autres produits financiers','income'),
  ('pcg','775','Produits de change','income'),
  ('pcg','777','Produits nets sur cessions de valeurs mobilières','income'),
  ('pcg','778','Gains de change','income'),
  ('pcg','781','Transferts de charges d''exploitation','income'),
  ('pcg','787','Transferts de charges financières','income'),
  ('pcg','81','Valeurs comptables des éléments d''actif cédés','expense'),
  ('pcg','82','Produits des cessions d''éléments d''actif','income'),
  ('pcg','83','Charges hors activités ordinaires','expense'),
  ('pcg','84','Produits hors activités ordinaires','income'),
  ('pcg','85','Dotations hors activités ordinaires','expense'),
  ('pcg','86','Reprises hors activités ordinaires','income'),
  ('pcg','87','Participation des salariés','expense'),
  ('pcg','88','Autres produits hors activités ordinaires','income'),
  ('pcg','89','Impôt sur les bénéfices','expense'),
  ('nct','101','Capital souscrit non appelé','asset'),
  ('nct','104','Capital souscrit, appelé, versé','equity'),
  ('nct','105','Primes liées au capital','equity'),
  ('nct','106','Réserve légale','equity'),
  ('nct','108','Autres réserves','equity'),
  ('nct','11','Report à nouveau','equity'),
  ('nct','12','Résultat net de l''exercice','equity'),
  ('nct','13','Subventions d''investissement','equity'),
  ('nct','14','Provisions pour risques et charges','liability'),
  ('nct','15','Emprunts obligataires','liability'),
  ('nct','16','Emprunts et dettes auprès des établissements de crédit','liability'),
  ('nct','165','Dépôts et cautionnements reçus','liability'),
  ('nct','168','Autres emprunts et dettes','liability'),
  ('nct','21','Immobilisations incorporelles','asset'),
  ('nct','211','Frais de constitution','asset'),
  ('nct','213','Fonds commercial','asset'),
  ('nct','214','Brevets, marques, droits','asset'),
  ('nct','22','Terrains','asset'),
  ('nct','23','Constructions','asset'),
  ('nct','231','Bâtiments','asset'),
  ('nct','24','Installations techniques et matériel','asset'),
  ('nct','245','Matériel de transport','asset'),
  ('nct','25','Autres immobilisations corporelles','asset'),
  ('nct','27','Autres immobilisations financières','asset'),
  ('nct','275','Dépôts et cautionnements versés','asset'),
  ('nct','28','Amortissements','asset'),
  ('nct','29','Provisions pour dépréciation des immobilisations','asset'),
  ('nct','31','Stocks de matières premières','asset'),
  ('nct','32','Stocks de produits en cours','asset'),
  ('nct','33','Stocks de produits finis','asset'),
  ('nct','34','Stocks de marchandises','asset'),
  ('nct','39','Provisions pour dépréciation des stocks','asset'),
  ('nct','401','Fournisseurs','liability'),
  ('nct','403','Fournisseurs, effets à payer','liability'),
  ('nct','408','Fournisseurs, factures non parvenues','liability'),
  ('nct','411','Clients','asset'),
  ('nct','413','Clients, effets à recevoir','asset'),
  ('nct','419','Clients créditeurs','liability'),
  ('nct','421','Personnel, rémunérations dues','liability'),
  ('nct','425','Personnel, avances et acomptes','asset'),
  ('nct','431','Sécurité sociale','liability'),
  ('nct','432','Caisse nationale de retraite','liability'),
  ('nct','44','État','liability'),
  ('nct','4431','État, TVA collectée','liability'),
  ('nct','4452','État, TVA déductible','asset'),
  ('nct','4455','État, TVA à payer','liability'),
  ('nct','446','État, impôts directs','liability'),
  ('nct','447','État, timbres et enregistrement','liability'),
  ('nct','455','Associés, comptes courants','liability'),
  ('nct','467','Autres débiteurs et créditeurs','liability'),
  ('nct','471','Comptes d''attente','asset'),
  ('nct','48','Créances et dettes hors activité','asset'),
  ('nct','491','Provisions pour dépréciation des créances clients','asset'),
  ('nct','512','Banques','asset'),
  ('nct','519','Concours bancaires courants','liability'),
  ('nct','532','Banques, comptes en devises','asset'),
  ('nct','54','Chèques postaux','asset'),
  ('nct','53','Caisse','asset'),
  ('nct','58','Virements internes','asset'),
  ('nct','601','Achats de matières premières','expense'),
  ('nct','603','Achats d''emballages','expense'),
  ('nct','606','Achats non stockés','expense'),
  ('nct','607','Achats de marchandises','expense'),
  ('nct','609','Rabais, remises, ristournes obtenus','income'),
  ('nct','611','Sous-traitance','expense'),
  ('nct','613','Locations','expense'),
  ('nct','615','Entretien et réparations','expense'),
  ('nct','616','Primes d''assurance','expense'),
  ('nct','622','Honoraires et commissions','expense'),
  ('nct','623','Publicité','expense'),
  ('nct','626','Frais postaux et télécommunications','expense'),
  ('nct','627','Services bancaires','expense'),
  ('nct','63','Impôts, taxes et versements assimilés','expense'),
  ('nct','654','Pertes sur créances irrécouvrables','expense'),
  ('nct','661','Rémunérations du personnel','expense'),
  ('nct','664','Charges de sécurité sociale','expense'),
  ('nct','671','Intérêts des emprunts','expense'),
  ('nct','675','Pertes de change','expense'),
  ('nct','681','Dotations aux amortissements','expense'),
  ('nct','687','Dotations aux provisions','expense'),
  ('nct','89','Impôt sur les bénéfices','expense'),
  ('nct','701','Ventes de produits finis','income'),
  ('nct','705','Prestations de services','income'),
  ('nct','707','Ventes de marchandises','income'),
  ('nct','709','Rabais, remises et ristournes accordés','expense'),
  ('nct','713','Variation des stocks','income'),
  ('nct','751','Redevances et produits divers','income'),
  ('nct','761','Produits de participations','income'),
  ('nct','765','Escomptes obtenus','income'),
  ('nct','766','Gains de change','income'),
  ('nct','781','Transferts de charges','income'),
  ('nct','82','Produits des cessions d''immobilisations','income'),
  ('nct','81','Valeurs comptables des immobilisations cédées','expense'),
  ('cgnc','111','Capital social ou personnel','equity'),
  ('cgnc','112','Primes d''émission et de fusion','equity'),
  ('cgnc','114','Réserve légale','equity'),
  ('cgnc','116','Autres réserves','equity'),
  ('cgnc','118','Report à nouveau','equity'),
  ('cgnc','119','Résultat net de l''exercice','equity'),
  ('cgnc','131','Subventions d''investissement','equity'),
  ('cgnc','135','Provisions pour risques et charges','liability'),
  ('cgnc','141','Emprunts obligataires','liability'),
  ('cgnc','148','Autres dettes de financement','liability'),
  ('cgnc','1481','Emprunts auprès des établissements de crédit','liability'),
  ('cgnc','211','Immobilisations en non-valeurs','asset'),
  ('cgnc','212','Frais préliminaires','asset'),
  ('cgnc','219','Charges à répartir','asset'),
  ('cgnc','221','Immobilisations incorporelles','asset'),
  ('cgnc','222','Fonds commercial','asset'),
  ('cgnc','223','Brevets, marques, droits','asset'),
  ('cgnc','231','Terrains','asset'),
  ('cgnc','233','Constructions','asset'),
  ('cgnc','234','Installations techniques et matériel','asset'),
  ('cgnc','235','Matériel de transport','asset'),
  ('cgnc','238','Autres immobilisations corporelles','asset'),
  ('cgnc','24','Immobilisations en cours','asset'),
  ('cgnc','25','Prêts et autres immobilisations financières','asset'),
  ('cgnc','258','Dépôts et cautionnements versés','asset'),
  ('cgnc','28','Amortissements des immobilisations','asset'),
  ('cgnc','29','Provisions pour dépréciation des immobilisations','asset'),
  ('cgnc','311','Matières et fournitures consommables','asset'),
  ('cgnc','312','Produits en cours','asset'),
  ('cgnc','313','Produits finis','asset'),
  ('cgnc','314','Marchandises','asset'),
  ('cgnc','315','Marchandises en cours de route','asset'),
  ('cgnc','39','Provisions pour dépréciation des stocks','asset'),
  ('cgnc','441','Fournisseurs et comptes rattachés','liability'),
  ('cgnc','4411','Fournisseurs','liability'),
  ('cgnc','442','Clients et comptes rattachés','asset'),
  ('cgnc','4421','Clients','asset'),
  ('cgnc','443','Personnel','liability'),
  ('cgnc','444','Organismes sociaux','liability'),
  ('cgnc','445','État','liability'),
  ('cgnc','4455','État, TVA facturée','liability'),
  ('cgnc','4456','État, TVA récupérable','asset'),
  ('cgnc','4457','État, impôts sur les résultats','liability'),
  ('cgnc','446','Comptes d''associés','liability'),
  ('cgnc','4462','Associés, comptes courants','liability'),
  ('cgnc','448','Autres créances et dettes','asset'),
  ('cgnc','4481','Comptes d''attente','asset'),
  ('cgnc','45','Autres provisions pour risques et charges','liability'),
  ('cgnc','511','Chèques et valeurs à encaisser','asset'),
  ('cgnc','514','Banques, solde débiteur','asset'),
  ('cgnc','5141','Banques (comptes courants)','asset'),
  ('cgnc','552','Crédits d''escompte','liability'),
  ('cgnc','553','Crédits de trésorerie','liability'),
  ('cgnc','554','Banques (soldes créditeurs)','liability'),
  ('cgnc','516','Caisses, régies d''avances et accréditifs','asset'),
  ('cgnc','5161','Caisse','asset'),
  ('cgnc','611','Achats de marchandises','expense'),
  ('cgnc','612','Achats de matières et fournitures','expense'),
  ('cgnc','6121','Achats de matières premières','expense'),
  ('cgnc','613','Achats d''autres approvisionnements','expense'),
  ('cgnc','614','Achats d''emballages','expense'),
  ('cgnc','616','Achats de travaux, études et prestations de services','expense'),
  ('cgnc','617','Achats non stockés de matières et fournitures','expense'),
  ('cgnc','618','Achats de petit matériel et outillage','expense'),
  ('cgnc','619','Rabais, remises et ristournes obtenus','income'),
  ('cgnc','621','Locations et charges locatives','expense'),
  ('cgnc','622','Redevances de crédit-bail','expense'),
  ('cgnc','623','Entretien et réparations','expense'),
  ('cgnc','624','Primes d''assurance','expense'),
  ('cgnc','625','Rémunérations du personnel extérieur','expense'),
  ('cgnc','626','Rémunérations d''intermédiaires et honoraires','expense'),
  ('cgnc','627','Redevances pour brevets et marques','expense'),
  ('cgnc','628','Frais de télécommunications','expense'),
  ('cgnc','631','Impôts et taxes directs','expense'),
  ('cgnc','634','Impôts et taxes indirects','expense'),
  ('cgnc','635','Autres impôts et taxes','expense'),
  ('cgnc','637','Rémunérations du personnel','expense'),
  ('cgnc','6371','Rémunérations du personnel administratif','expense'),
  ('cgnc','638','Autres charges externes','expense'),
  ('cgnc','641','Impôts et taxes directs','expense'),
  ('cgnc','645','Impôts et taxes indirects','expense'),
  ('cgnc','651','Pertes sur créances irrécouvrables','expense'),
  ('cgnc','658','Autres charges diverses','expense'),
  ('cgnc','671','Intérêts des emprunts','expense'),
  ('cgnc','675','Pertes de change','expense'),
  ('cgnc','681','Dotations d''exploitation','expense'),
  ('cgnc','687','Dotations aux amortissements','expense'),
  ('cgnc','89','Impôts sur les résultats','expense'),
  ('cgnc','711','Ventes de marchandises','income'),
  ('cgnc','712','Ventes de biens et services produits','income'),
  ('cgnc','7121','Ventes de biens produits','income'),
  ('cgnc','7124','Ventes de services produits','income'),
  ('cgnc','713','Variation des stocks','income'),
  ('cgnc','718','Autres produits d''exploitation','income'),
  ('cgnc','719','Rabais, remises et ristournes accordés','expense'),
  ('cgnc','732','Produits financiers','income'),
  ('cgnc','738','Intérêts et produits assimilés','income'),
  ('cgnc','751','Produits des cessions d''immobilisations','income'),
  ('cgnc','6513','Valeurs comptables des immobilisations cédées','expense'),
  ('cgnc','781','Transferts de charges d''exploitation','income')
on conflict (plan_id, code) do update
set label=excluded.label, account_type=excluded.account_type;

revoke all on private.accounting_plan_accounts from public, anon, authenticated;

create or replace function private.accounting_account_code_is_valid(
  p_company_id uuid,
  p_account_code text,
  p_plan_id text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan text;
  v_code text := pg_catalog.btrim(coalesce(p_account_code, ''));
begin
  if p_company_id is null or v_code = '' then return false; end if;

  if exists (
    select 1 from public.accounting_custom_accounts ca
    where ca.company_id = p_company_id and ca.code = v_code
  ) then
    return true;
  end if;

  v_plan := coalesce(p_plan_id, (
    select s.settings ->> 'plan'
    from public.accounting_settings s
    where s.company_id = p_company_id
  ), 'syscohada');

  if v_plan not in ('syscohada','pcg','nct','cgnc') then return false; end if;

  return exists (
    select 1 from private.accounting_plan_accounts pa
    where pa.plan_id = v_plan
      and pg_catalog.left(v_code, pg_catalog.length(pa.code)) = pa.code
  );
end;
$function$;

create or replace function private.assert_accounting_company_account_codes(
  p_company_id uuid,
  p_plan_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_plan_id not in ('syscohada','pcg','nct','cgnc') then
    raise exception 'Plan comptable inconnu : %.', p_plan_id using errcode='23514';
  end if;

  if exists (
    select 1 from public.accounting_entry_lines l
    where l.company_id=p_company_id
      and not private.accounting_account_code_is_valid(p_company_id,l.account_code,p_plan_id)
  ) then
    raise exception 'Le plan comptable choisi rend invalide au moins un compte utilisé dans les écritures.'
      using errcode='23514';
  end if;

  if exists (
    select 1 from public.accounting_assets a
    where a.company_id=p_company_id
      and not private.accounting_account_code_is_valid(p_company_id,a.account_code,p_plan_id)
  ) then
    raise exception 'Le plan comptable choisi rend invalide au moins un compte utilisé par une immobilisation.'
      using errcode='23514';
  end if;

  if exists (
    select 1 from public.accounting_custom_accounts ca
    join private.accounting_plan_accounts pa
      on pa.plan_id=p_plan_id and pa.code=ca.code
    where ca.company_id=p_company_id
  ) then
    raise exception 'Un compte personnalisé entre en conflit avec le plan comptable sélectionné.'
      using errcode='23505';
  end if;
end;
$function$;

create or replace function private.enforce_accounting_account_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_plan text;
  v_row record;
begin
  if tg_table_name='accounting_entry_lines' then
    if tg_op <> 'DELETE' and
       not private.accounting_account_code_is_valid(new.company_id,new.account_code,null) then
      raise exception 'Compte comptable inconnu dans le plan de l’entreprise : %.',new.account_code
        using errcode='23503';
    end if;
    return null;
  end if;

  if tg_table_name='accounting_assets' then
    if tg_op <> 'DELETE' and
       not private.accounting_account_code_is_valid(new.company_id,new.account_code,null) then
      raise exception 'Compte comptable d’immobilisation inconnu : %.',new.account_code
        using errcode='23503';
    end if;
    return null;
  end if;

  if tg_table_name='accounting_settings' then
    v_plan := coalesce(new.settings->>'plan','syscohada');
    perform private.assert_accounting_company_account_codes(new.company_id,v_plan);
    return null;
  end if;

  if tg_table_name='accounting_custom_accounts' then
    if tg_op <> 'DELETE' then
      v_company_id := new.company_id;
      v_plan := coalesce((
        select s.settings->>'plan' from public.accounting_settings s
        where s.company_id=new.company_id
      ),'syscohada');
      if v_plan not in ('syscohada','pcg','nct','cgnc') then
        raise exception 'Plan comptable inconnu : %.',v_plan using errcode='23514';
      end if;
      if exists (
        select 1 from private.accounting_plan_accounts pa
        where pa.plan_id=v_plan and pa.code=new.code
      ) then
        raise exception 'Le code % existe déjà dans le plan comptable.',new.code
          using errcode='23505';
      end if;
    end if;

    if tg_op <> 'INSERT' then
      v_company_id := old.company_id;
      for v_row in
        select distinct l.account_code
        from public.accounting_entry_lines l
        where l.company_id=old.company_id and l.account_code=old.code
        union
        select a.account_code
        from public.accounting_assets a
        where a.company_id=old.company_id and a.account_code=old.code
      loop
        if not private.accounting_account_code_is_valid(v_company_id,v_row.account_code,null) then
          raise exception 'Le compte personnalisé % est encore utilisé par une écriture ou une immobilisation.',old.code
            using errcode='23503';
        end if;
      end loop;
    end if;
    return null;
  end if;

  return null;
end;
$function$;

revoke all on function private.accounting_account_code_is_valid(uuid,text,text)
  from public, anon, authenticated;
revoke all on function private.assert_accounting_company_account_codes(uuid,text)
  from public, anon, authenticated;
revoke all on function private.enforce_accounting_account_references()
  from public, anon, authenticated;

create constraint trigger accounting_entry_lines_account_guard
after insert or update on public.accounting_entry_lines
deferrable initially deferred
for each row execute function private.enforce_accounting_account_references();

create constraint trigger accounting_assets_account_guard
after insert or update on public.accounting_assets
deferrable initially deferred
for each row execute function private.enforce_accounting_account_references();

create constraint trigger accounting_settings_plan_guard
after insert or update on public.accounting_settings
deferrable initially deferred
for each row execute function private.enforce_accounting_account_references();

create constraint trigger accounting_custom_accounts_guard
after insert or update or delete on public.accounting_custom_accounts
deferrable initially deferred
for each row execute function private.enforce_accounting_account_references();

create or replace function private.assert_accounting_entry_integrity(
  p_company_id uuid,
  p_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line_count integer;
  v_total_debit numeric(20,2);
  v_total_credit numeric(20,2);
begin
  if p_company_id is null or p_entry_id is null then return; end if;
  if not exists (
    select 1 from public.accounting_entries e
    where e.company_id=p_company_id and e.id=p_entry_id
  ) then return; end if;

  select count(*)::integer, coalesce(sum(l.debit),0), coalesce(sum(l.credit),0)
    into v_line_count,v_total_debit,v_total_credit
  from public.accounting_entry_lines l
  where l.company_id=p_company_id and l.entry_id=p_entry_id;

  if v_line_count < 2 then
    raise exception 'Une écriture doit comporter au moins deux lignes.' using errcode='23514';
  end if;
  if v_total_debit <= 0 or abs(v_total_debit-v_total_credit)>0.001 then
    raise exception 'Écriture déséquilibrée : débit %, crédit %.',v_total_debit,v_total_credit
      using errcode='23514';
  end if;
  if exists (
    select 1 from public.accounting_entry_lines l
    where l.company_id=p_company_id and l.entry_id=p_entry_id
      and pg_catalog.btrim(l.third_name)<>''
      and (
        select count(*) from public.accounting_thirds t
        where t.company_id=l.company_id
          and pg_catalog.lower(pg_catalog.btrim(t.name))
              =pg_catalog.lower(pg_catalog.btrim(l.third_name))
      )<>1
  ) then
    raise exception 'Une ligne comptable référence un tiers absent ou ambigu.' using errcode='23503';
  end if;
  if exists (
    select 1 from public.accounting_entry_lines l
    where l.company_id=p_company_id and l.entry_id=p_entry_id
      and not private.accounting_account_code_is_valid(p_company_id,l.account_code,null)
  ) then
    raise exception 'Une écriture référence un compte absent du plan comptable de l’entreprise.'
      using errcode='23503';
  end if;
end;
$function$;
