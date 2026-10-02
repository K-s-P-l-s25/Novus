//! M0 spike S2: rusqlite + SQLCipher + FTS5 trigram.
//! Throwaway code. Prints evidence for docs/SPIKES.md.
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

const MARKER: &str = "SECRET-MARKER-7f3a";
// Fixed test key only; real keys come from HKDF("kaisen/db/v1").
const KEY_HEX: &str = "2b7e151628aed2a6abf7158809cf4f3c2b7e151628aed2a6abf7158809cf4f3c";

fn open_keyed(path: &Path, key_hex: &str) -> rusqlite::Result<Connection> {
    let c = Connection::open(path)?;
    c.execute_batch(&format!("PRAGMA key = \"x'{key_hex}'\";"))?;
    Ok(c)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = std::env::temp_dir().join("kaisen-spike-s2");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    let db = dir.join("kaisen.db");

    let c = open_keyed(&db, KEY_HEX)?;
    let cipher_version: String = c.query_row("PRAGMA cipher_version", [], |r| r.get(0))?;
    let provider: String = c.query_row("PRAGMA cipher_provider", [], |r| r.get(0))?;
    let sqlite_version: String = c.query_row("select sqlite_version()", [], |r| r.get(0))?;
    println!("sqlite_version   = {sqlite_version}");
    println!("cipher_version   = {cipher_version}");
    println!("cipher_provider  = {provider}");

    let mut st = c.prepare("SELECT compile_options FROM pragma_compile_options")?;
    let opts: Vec<String> = st.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    drop(st);
    let fts5 = opts.iter().any(|o| o == "ENABLE_FTS5");
    println!("ENABLE_FTS5      = {fts5}");
    println!("compile_options  = {}", opts.join(", "));

    c.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);
         CREATE VIRTUAL TABLE search_index USING fts5(title, body, tags, tokenize = 'trigram');",
    )?;
    c.execute("INSERT INTO notes VALUES ('n1', ?1)", [format!("{MARKER} lives here")])?;
    c.execute(
        "INSERT INTO search_index (rowid, title, body, tags) VALUES (1, 'util.rs', ?1, '')",
        ["fn getUserById(id: u64) -> User { todo!() }"],
    )?;
    let hit: i64 = c.query_row(
        "SELECT rowid FROM search_index WHERE search_index MATCH 'getUs'",
        [],
        |r| r.get(0),
    )?;
    println!("trigram 'getUs'  -> rowid {hit}");
    let miss: i64 = c.query_row(
        "SELECT count(*) FROM search_index WHERE search_index MATCH 'xyzq'",
        [],
        |r| r.get(0),
    )?;
    println!("trigram 'xyzq'   -> {miss} rows");
    c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    drop(c);

    // Hex check: neither the marker nor the SQLite header may appear in the file.
    let bytes = std::fs::read(&db)?;
    let has_marker = bytes.windows(MARKER.len()).any(|w| w == MARKER.as_bytes());
    let has_header = bytes.starts_with(b"SQLite format 3\0");
    println!("file bytes       = {}", bytes.len());
    println!("marker in file   = {has_marker}");
    println!("plain header     = {has_header}");
    println!("first 32 bytes   = {}", bytes[..32].iter().map(|b| format!("{b:02x}")).collect::<String>());

    // Wrong key must fail; no key must fail.
    let wrong = open_keyed(&db, &"00".repeat(32))?;
    let wrong_res = wrong.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0));
    println!("wrong key read   = {}", if wrong_res.is_err() { "rejected" } else { "ACCEPTED (bad)" });
    let nokey = Connection::open_with_flags(&db, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let nokey_res = nokey.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0));
    println!("no key read      = {}", if nokey_res.is_err() { "rejected" } else { "ACCEPTED (bad)" });

    // Right key reopens.
    let ok = open_keyed(&db, KEY_HEX)?;
    let n: i64 = ok.query_row("SELECT count(*) FROM notes", [], |r| r.get(0))?;
    println!("right key read   = {n} row(s)");

    let pass = fts5 && hit == 1 && miss == 0 && !has_marker && !has_header
        && wrong_res.is_err() && nokey_res.is_err() && n == 1;
    println!("RESULT           = {}", if pass { "PASS" } else { "FAIL" });
    if !pass { std::process::exit(1); }
    Ok(())
}
