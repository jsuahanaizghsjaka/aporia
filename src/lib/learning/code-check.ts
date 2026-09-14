// Bounded arithmetic subset, never eval or execute arbitrary Python.
export function checkDouble(source: string): boolean {
  try {
    if (source.length > 1000) return false;
    let expression = source.trim();
    if (expression.startsWith("def")) {
      const match =
        /^def\s+double\(n\):(?:[ \t]*\n[ \t]+|[ \t]+)return[ \t]+([^\n]+)$/.exec(
          expression,
        );
      if (!match) return false;
      expression = match[1];
    } else expression = expression.replace(/^return\s+/, "");
    const tokens = expression.match(/\d+|n|\/\/|[()+*%\-]/g) ?? [];
    if (
      !tokens.length ||
      tokens.length > 100 ||
      tokens.join("") !== expression.replace(/\s/g, "")
    )
      return false;
    function evaluate(n: number) {
      let i = 0,
        depth = 0;
      const safe = (v: number) => {
        if (!Number.isSafeInteger(v)) throw new Error();
        return v;
      };
      function atom(): number {
        if (++depth > 30) throw new Error();
        const token = tokens[i++];
        let value: number;
        if (token === "(") {
          value = sum();
          if (tokens[i++] !== ")") throw new Error();
        } else if (token === "+" || token === "-")
          value = (token === "-" ? -1 : 1) * atom();
        else if (token === "n") value = n;
        else if (token && /^\d+$/.test(token)) value = Number(token);
        else throw new Error();
        depth--;
        return safe(value);
      }
      function product(): number {
        let value = atom();
        while (["*", "//", "%"].includes(tokens[i])) {
          const op = tokens[i++],
            b = atom();
          if (op !== "*" && b === 0) throw new Error();
          value = safe(
            op === "*"
              ? value * b
              : op === "//"
                ? Math.floor(value / b)
                : value - Math.floor(value / b) * b,
          );
        }
        return value;
      }
      function sum(): number {
        let value = product();
        while (["+", "-"].includes(tokens[i])) {
          const op = tokens[i++],
            b = product();
          value = safe(op === "+" ? value + b : value - b);
        }
        return value;
      }
      const result = sum();
      if (i !== tokens.length) throw new Error();
      return result;
    }
    return [-101, -7, -2, -1, 0, 1, 2, 5, 31, 1009].every(
      (n) => evaluate(n) === n * 2,
    );
  } catch {
    return false;
  }
}
