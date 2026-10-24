// Plan de conturi general (OMFP 1802/2014) – conturile sintetice folosite cel mai des.
export const PLAN_CONTURI = [
  ["1012", "Capital subscris vărsat", "P"], ["1061", "Rezerve legale", "P"], ["1171", "Rezultatul reportat", "B"],
  ["121", "Profit sau pierdere", "B"], ["2131", "Echipamente tehnologice", "A"], ["2133", "Mijloace de transport", "A"],
  ["214", "Mobilier, aparatură birotică", "A"], ["2813", "Amortizarea instalațiilor și mijloacelor de transport", "P"],
  ["301", "Materii prime", "A"], ["302", "Materiale consumabile", "A"], ["303", "Materiale de natura obiectelor de inventar", "A"],
  ["371", "Mărfuri", "A"], ["401", "Furnizori", "P"], ["403", "Efecte de plătit", "P"], ["404", "Furnizori de imobilizări", "P"],
  ["408", "Furnizori - facturi nesosite", "P"], ["409", "Furnizori - debitori", "A"], ["411", "Clienți", "A"],
  ["418", "Clienți - facturi de întocmit", "A"], ["421", "Personal - salarii datorate", "P"], ["423", "Personal - ajutoare materiale datorate", "P"],
  ["425", "Avansuri acordate personalului", "A"], ["4271", "Rețineri din salarii datorate terților", "P"],
  ["431", "Asigurări sociale", "P"], ["436", "Contribuția asiguratorie pentru muncă", "P"], ["4411", "Impozitul pe profit", "P"],
  ["4418", "Impozitul pe venit", "P"], ["4423", "TVA de plată", "P"], ["4424", "TVA de recuperat", "A"],
  ["4426", "TVA deductibilă", "A"], ["4427", "TVA colectată", "P"], ["4428", "TVA neexigibilă", "B"],
  ["444", "Impozitul pe venituri de natura salariilor", "P"], ["446", "Alte impozite, taxe și vărsăminte asimilate", "P"],
  ["455", "Sume datorate acționarilor / asociaților", "P"], ["462", "Creditori diverși", "P"], ["471", "Cheltuieli înregistrate în avans", "A"],
  ["472", "Venituri înregistrate în avans", "P"], ["473", "Decontări din operațiuni în curs de clarificare", "B"],
  ["5121", "Conturi la bănci în lei", "A"], ["5124", "Conturi la bănci în valută", "A"], ["5125", "Sume în curs de decontare", "A"],
  ["5311", "Casa în lei", "A"], ["5314", "Casa în valută", "A"], ["542", "Avansuri de trezorerie", "A"], ["581", "Viramente interne", "B"],
  ["601", "Cheltuieli cu materiile prime", "A"], ["602", "Cheltuieli cu materialele consumabile", "A"],
  ["603", "Cheltuieli privind materialele de natura obiectelor de inventar", "A"], ["604", "Cheltuieli privind materialele nestocate", "A"],
  ["605", "Cheltuieli privind utilitățile", "A"], ["607", "Cheltuieli privind mărfurile", "A"], ["611", "Cheltuieli cu întreținerea și reparațiile", "A"],
  ["612", "Cheltuieli cu redevențele, locațiile de gestiune și chiriile", "A"], ["613", "Cheltuieli cu primele de asigurare", "A"],
  ["614", "Cheltuieli cu studiile și cercetările", "A"], ["621", "Cheltuieli cu colaboratorii", "A"],
  ["622", "Cheltuieli privind comisioanele și onorariile", "A"], ["623", "Cheltuieli de protocol, reclamă și publicitate", "A"],
  ["624", "Cheltuieli cu transportul de bunuri și personal", "A"], ["625", "Cheltuieli cu deplasări, detașări și transferări", "A"],
  ["626", "Cheltuieli poștale și taxe de telecomunicații", "A"], ["627", "Cheltuieli cu serviciile bancare și asimilate", "A"],
  ["628", "Alte cheltuieli cu serviciile executate de terți", "A"], ["635", "Cheltuieli cu alte impozite, taxe și vărsăminte asimilate", "A"],
  ["641", "Cheltuieli cu salariile personalului", "A"], ["646", "Cheltuieli privind contribuția asiguratorie pentru muncă", "A"],
  ["6581", "Despăgubiri, amenzi și penalități", "A"], ["665", "Cheltuieli din diferențe de curs valutar", "A"],
  ["666", "Cheltuieli privind dobânzile", "A"], ["681", "Cheltuieli de exploatare privind amortizările", "A"],
  ["691", "Cheltuieli cu impozitul pe profit", "A"], ["701", "Venituri din vânzarea produselor finite", "P"],
  ["704", "Venituri din servicii prestate", "P"], ["707", "Venituri din vânzarea mărfurilor", "P"], ["708", "Venituri din activități diverse", "P"],
  ["765", "Venituri din diferențe de curs valutar", "P"], ["766", "Venituri din dobânzi", "P"], ["7588", "Alte venituri din exploatare", "P"],
].map(([cont, denumire, tip]) => ({ cont, denumire, tip }));

export const accountName = (cont) => {
  const base = PLAN_CONTURI.find((a) => a.cont === cont) || PLAN_CONTURI.find((a) => cont.startsWith(`${a.cont}.`));
  return base?.denumire || "";
};
