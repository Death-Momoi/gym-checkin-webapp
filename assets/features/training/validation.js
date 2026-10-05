  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function validate(record) {
    if (!record || typeof record !== 'object' ||
        typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(record.id) ||
        !validDate(record.date) ||
        typeof record.exercise !== 'string' || !record.exercise.trim() || record.exercise.length > 60 ||
        typeof record.note !== 'string' || record.note.length > 200 ||
        !Number.isFinite(record.weight) || record.weight < 0 || record.weight > 2000 ||
        !Number.isInteger(record.reps) || record.reps < 1 || record.reps > 999 ||
        !Number.isInteger(record.sets) || record.sets < 1 || record.sets > 100 ||
        !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 ||
        !Number.isSafeInteger(record.updatedAt) || record.updatedAt < record.createdAt) {
      throw new Error('紀錄格式或數值不正確，未變更手機資料。');
    }
    return { id: record.id, date: record.date, exercise: record.exercise.trim(),
      weight: record.weight, reps: record.reps, sets: record.sets, note: record.note.trim(),
      createdAt: record.createdAt, updatedAt: record.updatedAt };
  }

export {validDate,validate};
