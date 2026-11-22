// MIZANE — Fonctions pures de calcul, indépendantes de l'interface.
export function calculate(left, operator, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Saisissez deux nombres valides.");
  let result;
  switch (operator) {
    case "+": result = a + b; break;
    case "-": result = a - b; break;
    case "*": result = a * b; break;
    case "/":
      if (b === 0) throw new Error("La division par zéro est impossible.");
      result = a / b;
      break;
    default: throw new Error("Opération non reconnue.");
  }
  return Math.round((result + Number.EPSILON) * 100000000) / 100000000;
}
