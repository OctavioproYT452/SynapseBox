//! Fecha y hora local sin dependencias externas (se usa para nombres de copias de conflicto y de la papelera).
use std::time::{SystemTime, UNIX_EPOCH};

fn civil(days: i64) -> (i64, u32, u32) { // días desde 1970-01-01 → (año, mes, día)
    let z = days + 719468; let era = z.div_euclid(146097); let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
/// "yyyymmdd" y "yyyymmdd-HHMMSS" en UTC (basta para dar nombres únicos y ordenables).
pub fn stamp(with_time: bool) -> String {
    let s = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let (y, m, d) = civil(s.div_euclid(86400)); let t = s.rem_euclid(86400);
    if with_time { format!("{:04}{:02}{:02}-{:02}{:02}{:02}", y, m, d, t / 3600, (t % 3600) / 60, t % 60) } else { format!("{:04}{:02}{:02}", y, m, d) }
}
