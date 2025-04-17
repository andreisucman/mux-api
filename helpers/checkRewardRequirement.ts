export default function checkRewardCompletion(obj1: { [key: string]: any }, obj2: { [key: string]: any }, sign = 1) {
  let max = -Infinity;

  function recurse(o1: any, o2: any) {
    if (typeof o1 === "object" && o1 !== null) {
      if (Array.isArray(o1)) {
        if (!Array.isArray(o2)) return;
        for (let i = 0; i < o1.length; i++) {
          const elem2 = i < o2.length ? o2[i] : o2[0];
          if (elem2 === undefined) continue;
          recurse(o1[i], elem2);
        }
      } else {
        for (const key in o1) {
          if (o2.hasOwnProperty(key)) {
            recurse(o1[key], o2[key]);
          }
        }
      }
    } else if (typeof o1 === "number" && typeof o2 === "number" && o2 !== 0) {
      const division = (o1 / o2) * sign;
      if (division > max) {
        max = division;
      }
    }
  }

  recurse(obj1, obj2);
  return max === -Infinity ? 0 : max * 100;
}
