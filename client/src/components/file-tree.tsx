import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ChevronRight, ChevronDown, FileCode, FileText, Folder, FolderOpen, File, RefreshCw, Loader2 } from "lucide-react";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of paths) {
    const parts = filePath.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      let existing = currentLevel.find((n) => n.name === part && n.isDir === !isLast);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isDir: !isLast,
          children: [],
        };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    }).map((n) => ({ ...n, children: sortNodes(n.children) }));
  };

  return sortNodes(root);
}

function getAllDirs(paths: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (["py"].includes(ext)) return <FileCode className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
  if (["json", "yaml", "yml", "toml"].includes(ext)) return <FileText className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
  if (["md", "txt", "rst"].includes(ext)) return <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  if (["env", "example"].includes(ext) || name.startsWith(".env")) return <File className="w-3.5 h-3.5 text-green-500 shrink-0" />;
  return <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

const REGEN_PATTERN = /orchestrator|entrypoint|tools\/|adapters\/|graph|crew|agent_node/i;

function TreeItem({
  node,
  depth,
  activeFile,
  expandedDirs,
  onFileClick,
  onToggleDir,
  onRegenFile,
  regeneratingFile,
}: {
  node: TreeNode;
  depth: number;
  activeFile: string;
  expandedDirs: Set<string>;
  onFileClick: (path: string) => void;
  onToggleDir: (path: string) => void;
  onRegenFile?: (path: string) => void;
  regeneratingFile?: string | null;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isActive = !node.isDir && node.path === activeFile;
  const canRegen = !node.isDir && onRegenFile && REGEN_PATTERN.test(node.path);
  const isRegenerating = regeneratingFile === node.path;

  return (
    <>
      <div className="flex items-center group">
        <button
          className={`flex items-center gap-1.5 flex-1 text-left py-1 px-2 text-xs rounded-sm transition-colors hover:bg-muted/60 min-w-0 ${
            isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground/80"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => (node.isDir ? onToggleDir(node.path) : onFileClick(node.path))}
          data-testid={node.isDir ? `tree-dir-${node.path.replace(/[/.]/g, "-")}` : `tree-file-${node.path.replace(/[/.]/g, "-")}`}
        >
          {node.isDir ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              {getFileIcon(node.name)}
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {canRegen && (
          <button
            className="h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mr-1 rounded hover:bg-muted"
            disabled={isRegenerating}
            onClick={(e) => { e.stopPropagation(); onRegenFile!(node.path); }}
            title="Regenerate this file"
            data-testid={`button-regen-file-${node.path.replace(/[/.]/g, "-")}`}
          >
            {isRegenerating ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /> : <RefreshCw className="w-3 h-3 text-muted-foreground" />}
          </button>
        )}
      </div>
      {node.isDir && isExpanded &&
        node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFile={activeFile}
            expandedDirs={expandedDirs}
            onFileClick={onFileClick}
            onToggleDir={onToggleDir}
            onRegenFile={onRegenFile}
            regeneratingFile={regeneratingFile}
          />
        ))}
    </>
  );
}

export function FileTree({
  filePaths,
  activeFile,
  onFileSelect,
  onRegenFile,
  regeneratingFile,
}: {
  filePaths: string[];
  activeFile: string;
  onFileSelect: (path: string) => void;
  onRegenFile?: (path: string) => void;
  regeneratingFile?: string | null;
}) {
  const tree = useMemo(() => buildTree(filePaths), [filePaths]);

  const pathsKey = useMemo(() => filePaths.slice().sort().join("\n"), [filePaths]);
  const prevPathsKey = useRef(pathsKey);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => getAllDirs(filePaths));

  useEffect(() => {
    if (prevPathsKey.current !== pathsKey) {
      prevPathsKey.current = pathsKey;
      setExpandedDirs(getAllDirs(filePaths));
    }
  }, [pathsKey, filePaths]);

  const onToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col py-1 overflow-y-auto" data-testid="file-tree">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          activeFile={activeFile}
          expandedDirs={expandedDirs}
          onFileClick={onFileSelect}
          onToggleDir={onToggleDir}
          onRegenFile={onRegenFile}
          regeneratingFile={regeneratingFile}
        />
      ))}
    </div>
  );
}
