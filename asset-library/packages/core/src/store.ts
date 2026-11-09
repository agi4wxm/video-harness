// 文件存储：素材库是一个普通目录，可以放进 git（档案、代码、SVG），大文件按内容哈希放在 blobs/（不进 git）。
//
// <root>/
//   library.yaml
//   entries/<大类>/<小类>/<短名>/{entry.yaml, files/, previews/, src/, reviews/}
//   blobs/<前两位>/<sha256>.<ext>
//   index/ （自动生成）
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { Entry, LibraryFile, Review, type EntryInput, type EntryT, type LibraryFileT, type ReviewT, type Status } from "./schema.ts";
import { subtypeOf } from "./taxonomy.ts";

export class LibraryError extends Error {}

const today = () => new Date().toISOString().slice(0, 10);

export interface LoadIssue { path: string; message: string }

export class Library {
  readonly root: string;
  readonly meta: LibraryFileT;
  private cache: Map<string, EntryT> | null = null;
  readonly loadIssues: LoadIssue[] = [];

  private constructor(root: string, meta: LibraryFileT) {
    this.root = root;
    this.meta = meta;
  }

  static init(root: string, name: string, description = ""): Library {
    const r = resolve(root);
    mkdirSync(join(r, "entries"), { recursive: true });
    const meta = LibraryFile.parse({ name, description });
    if (!existsSync(join(r, "library.yaml"))) writeFileSync(join(r, "library.yaml"), YAML.stringify(meta));
    if (!existsSync(join(r, ".gitignore"))) writeFileSync(join(r, ".gitignore"), "blobs/\nindex/\n.cache/\n");
    return Library.open(r);
  }

  static open(root: string): Library {
    const r = resolve(root);
    const f = join(r, "library.yaml");
    if (!existsSync(f)) throw new LibraryError(`${r} 不是素材库（缺少 library.yaml）。用 lib init 创建。`);
    return new Library(r, LibraryFile.parse(YAML.parse(readFileSync(f, "utf8"))));
  }

  get blobsDir(): string { return resolve(this.root, this.meta.blobs); }

  dirOf(id: string): string {
    const [type, slug] = id.split("/");
    const [cat, sub] = type.split(".");
    return join(this.root, "entries", cat, sub, slug);
  }

  /** 读取全部条目（带缓存）；格式错误的条目记入 loadIssues，不中断 */
  entries(): EntryT[] {
    if (!this.cache) {
      this.cache = new Map();
      this.loadIssues.length = 0;
      const base = join(this.root, "entries");
      if (existsSync(base)) for (const cat of readdirSync(base)) for (const sub of safeDirs(join(base, cat))) for (const slug of safeDirs(join(base, cat, sub))) {
        const f = join(base, cat, sub, slug, "entry.yaml");
        if (!existsSync(f)) continue;
        try {
          const e = Entry.parse(YAML.parse(readFileSync(f, "utf8")));
          const expected = `${cat}.${sub}/${slug}`;
          if (e.id !== expected) this.loadIssues.push({ path: relative(this.root, f), message: `id ${e.id} 与目录不符（应为 ${expected}）` });
          this.cache.set(e.id, e);
        } catch (err) {
          this.loadIssues.push({ path: relative(this.root, f), message: (err as Error).message.slice(0, 500) });
        }
      }
    }
    return [...this.cache.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  invalidate() { this.cache = null; }

  get(id: string): EntryT | undefined {
    this.entries();
    return this.cache!.get(id.split("@")[0]);
  }

  require(id: string): EntryT {
    const e = this.get(id);
    if (!e) throw new LibraryError(`没有这条素材：${id}`);
    return e;
  }

  /** 新建草稿条目（目录 + 档案模板） */
  create(input: Omit<EntryInput, "created" | "updated" | "id"> & { slug: string }): EntryT {
    const st = subtypeOf(input.type);
    if (!st) throw new LibraryError(`未知类型 ${input.type}`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.slug)) throw new LibraryError("短名只能用小写字母、数字、连字符");
    const id = `${input.type}/${input.slug}`;
    if (existsSync(join(this.dirOf(id), "entry.yaml"))) throw new LibraryError(`已存在：${id}`);
    const { slug: _slug, ...rest } = input;
    const e = Entry.parse({ ...rest, id, created: today(), updated: today() });
    for (const d of ["files", "previews", "reviews"]) mkdirSync(join(this.dirOf(id), d), { recursive: true });
    this.write(e);
    return e;
  }

  /** 保存条目。已通过的条目不可直接修改，必须先 bump 版本（变回草稿）。 */
  save(e: EntryT, opts: { allowApproved?: boolean } = {}): EntryT {
    const old = this.get(e.id);
    if (old && old.status === "approved" && !opts.allowApproved && old.version === e.version) {
      throw new LibraryError(`${e.id}@${e.version} 已通过审查，不能直接修改：先 lib bump 生成新版本`);
    }
    const next = Entry.parse({ ...e, updated: today() });
    this.write(next);
    return next;
  }

  private write(e: EntryT) {
    const dir = this.dirOf(e.id);
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, ".entry.yaml.tmp");
    writeFileSync(tmp, YAML.stringify(e, { lineWidth: 120 }));
    renameSync(tmp, join(dir, "entry.yaml"));
    this.cache?.set(e.id, e);
  }

  remove(id: string) {
    rmSync(this.dirOf(id), { recursive: true, force: true });
    this.cache?.delete(id);
  }

  /** 把文件放进 blobs（内容寻址，同一文件只存一份），返回 blob 引用 */
  importBlob(path: string): string {
    const buf = readFileSync(path);
    const hex = createHash("sha256").update(buf).digest("hex");
    const ext = extname(path).toLowerCase().replace(/[^.a-z0-9]/g, "");
    const dest = join(this.blobsDir, hex.slice(0, 2), hex + ext);
    if (!existsSync(dest)) { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(path, dest); }
    return `blob:sha256:${hex}${ext}`;
  }

  /** 把小文件复制进条目目录（files/ 或 previews/），返回相对引用 */
  importLocal(id: string, path: string, sub: "files" | "previews" | "src" = "files", name = basename(path)): string {
    const dest = join(this.dirOf(id), sub, name);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(path, dest);
    return `${sub}/${name}`;
  }

  /** 文件引用 → 绝对路径（不检查存在） */
  resolveRef(id: string, ref: string): string {
    const m = /^blob:sha256:([0-9a-f]{64})(\.[a-z0-9]+)?$/.exec(ref);
    if (m) return join(this.blobsDir, m[1].slice(0, 2), m[1] + (m[2] ?? ""));
    return join(this.dirOf(id), ref);
  }

  refExists(id: string, ref: string): boolean {
    return existsSync(this.resolveRef(id, ref));
  }

  cover(e: EntryT): string | null {
    const c = e.cover ?? e.previews.find((p) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(p));
    return c ?? null;
  }

  // ---------------------------------------------------------------- 审查

  reviews(id: string): ReviewT[] {
    const dir = join(this.dirOf(id), "reviews");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()
      .map((f) => Review.parse(YAML.parse(readFileSync(join(dir, f), "utf8"))));
  }

  addReview(id: string, r: Omit<ReviewT, "date" | "version"> & { date?: string }): ReviewT {
    const e = this.require(id);
    const review = Review.parse({ ...r, date: r.date ?? new Date().toISOString(), version: e.version });
    const dir = join(this.dirOf(id), "reviews");
    mkdirSync(dir, { recursive: true });
    const stamp = review.date.replace(/[:.]/g, "-");
    writeFileSync(join(dir, `${stamp}.yaml`), YAML.stringify(review));
    return review;
  }

  /** 状态流转：draft → review → approved；任何状态 → deprecated；review → draft（退回） */
  setStatus(id: string, status: Status, check: (e: EntryT) => string[]): EntryT {
    const e = this.require(id);
    const allowed: Record<Status, Status[]> = {
      draft: ["review", "deprecated"],
      review: ["approved", "draft", "deprecated"],
      approved: ["deprecated"],
      deprecated: ["draft"],
    };
    if (e.status === status) return e;
    if (!allowed[e.status].includes(status)) throw new LibraryError(`不能从「${e.status}」改为「${status}」`);
    if (status === "review" || status === "approved") {
      const problems = check(e);
      if (problems.length) throw new LibraryError(`不满足${status === "review" ? "提交审查" : "通过"}条件：\n- ${problems.join("\n- ")}`);
    }
    if (status === "approved") {
      const last = this.reviews(id).filter((r) => r.version === e.version && r.verdict !== "comment").at(-1);
      if (!last || last.verdict !== "approve") throw new LibraryError("通过前需要一条针对当前版本的「通过」审查记录（lib review）");
    }
    return this.save({ ...e, status }, { allowApproved: true });
  }

  /** 升版本：已通过的条目要修改时用，新版本回到草稿 */
  bump(id: string, part: "major" | "minor" | "patch" = "minor"): EntryT {
    const e = this.require(id);
    const [a, b, c] = e.version.split(".").map(Number);
    const version = part === "major" ? `${a + 1}.0.0` : part === "minor" ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
    return this.save({ ...e, version, status: "draft" }, { allowApproved: true });
  }

  fileSize(id: string, ref: string): number | null {
    const p = this.resolveRef(id, ref);
    return existsSync(p) ? statSync(p).size : null;
  }
}

function safeDirs(d: string): string[] {
  try { return readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory() && !x.name.startsWith(".")).map((x) => x.name); }
  catch { return []; }
}
