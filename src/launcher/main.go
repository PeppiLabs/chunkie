package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

//go:embed all:dist
var embeddedDist embed.FS

const banner = `
============================================================
   ____ _                     _     _      
  / ___| |__  _   _ _ __ | | __(_) ___ 
 | |   | '_ \| | | | '_ \| |/ /| |/ _ \
 | |___| | | | |_| | | | |   < | |  __/
  \____|_| |_|\__,_|_| |_|_|\_\\|_|\___|

  See how RAG actually works in your browser
============================================================
`

func init() {
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	_ = mime.AddExtensionType(".js", "text/javascript")
	_ = mime.AddExtensionType(".mjs", "text/javascript")
	_ = mime.AddExtensionType(".css", "text/css")
	_ = mime.AddExtensionType(".json", "application/json")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".woff2", "font/woff2")
	_ = mime.AddExtensionType(".html", "text/html; charset=utf-8")
}

func pauseOnError(err error) {
	if err != nil {
		fmt.Printf("\n[ERROR] %v\n", err)
	}
	fmt.Println("\nPress Enter to exit...")
	var input string
	_, _ = fmt.Scanln(&input)
}

func openBrowser(url string) {
	time.Sleep(300 * time.Millisecond)
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func findAvailablePort(startPort int) (net.Listener, int, error) {
	for p := startPort; p < startPort+100; p++ {
		l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			return l, p, nil
		}
	}
	// Fallback to random dynamic port
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, 0, err
	}
	return l, l.Addr().(*net.TCPAddr).Port, nil
}

func getFileSystem() (http.FileSystem, string, error) {
	// 1. Try embedded bundle first (ensures standalone portability)
	sub, err := fs.Sub(embeddedDist, "dist")
	if err == nil {
		if f, err := sub.Open("index.html"); err == nil {
			_ = f.Close()
			return http.FS(sub), "embedded bundle", nil
		}
	}

	// 2. Fallback to disk if embedded is empty
	exePath, err := os.Executable()
	candidates := []string{}
	if err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exePath), "dist"))
	}
	cwd, err := os.Getwd()
	if err == nil {
		candidates = append(candidates, filepath.Join(cwd, "dist"))
	}

	for _, cand := range candidates {
		idx := filepath.Join(cand, "index.html")
		if info, err := os.Stat(idx); err == nil && !info.IsDir() {
			return http.Dir(cand), fmt.Sprintf("disk (%s)", cand), nil
		}
	}

	return nil, "", fmt.Errorf("could not find index.html in embedded bundle or on disk")
}

func runDevMode(openBrowserFlag bool) {
	fmt.Println("[INFO] Starting in development mode...")

	_, err := exec.LookPath("node")
	if err != nil {
		pauseOnError(fmt.Errorf("Node.js was not found in your PATH. Install Node.js >= 20.19.0 from https://nodejs.org/"))
		os.Exit(1)
	}

	if _, err := os.Stat("node_modules"); os.IsNotExist(err) {
		fmt.Println("[INFO] node_modules not found. Running npm install...")
		installCmd := exec.Command("cmd", "/c", "npm install")
		installCmd.Stdout = os.Stdout
		installCmd.Stderr = os.Stderr
		installCmd.Stdin = os.Stdin
		if err := installCmd.Run(); err != nil {
			pauseOnError(fmt.Errorf("npm install failed: %w", err))
			os.Exit(1)
		}
	}

	args := []string{"run", "dev"}
	if openBrowserFlag {
		args = append(args, "--", "--open")
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", append([]string{"/c", "npm"}, args...)...)
	} else {
		cmd = exec.Command("npm", args...)
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		if cmd.Process != nil {
			if runtime.GOOS == "windows" {
				_ = exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
			} else {
				_ = cmd.Process.Kill()
			}
		}
		os.Exit(0)
	}()

	if err := cmd.Run(); err != nil {
		pauseOnError(err)
	}
}

func main() {
	portFlag := flag.Int("port", 5173, "Port to serve Chunkie on")
	noBrowserFlag := flag.Bool("no-browser", false, "Do not automatically open the browser")
	devFlag := flag.Bool("dev", false, "Run in Vite development mode instead of standalone")

	flag.Usage = func() {
		fmt.Print(banner)
		fmt.Println("Usage: chunkie.exe [options]")
		fmt.Println("\nOptions:")
		flag.PrintDefaults()
		fmt.Println("\nExamples:")
		fmt.Println("  chunkie.exe              Start standalone Chunkie and open browser")
		fmt.Println("  chunkie.exe -port 8080   Run on custom port 8080")
		fmt.Println("  chunkie.exe -no-browser  Run without auto-opening browser")
		fmt.Println("  chunkie.exe -dev         Run Vite development server")
		fmt.Println()
	}
	flag.Parse()

	fmt.Print(banner)

	if *devFlag {
		runDevMode(!*noBrowserFlag)
		return
	}

	fileSystem, sourceDesc, err := getFileSystem()
	if err != nil {
		pauseOnError(err)
		os.Exit(1)
	}

	fileServer := http.FileServer(fileSystem)

	// Custom HTTP handler enforcing CORS isolation headers, correct MIME types, and SPA fallback
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Required for WebAssembly multithreading (SharedArrayBuffer)
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")

		// Use path.Clean to ensure forward-slash '/' separated paths on all platforms
		urlPath := path.Clean(r.URL.Path)
		relPath := strings.TrimPrefix(urlPath, "/")
		if relPath == "" || relPath == "." {
			relPath = "index.html"
		}

		// Try opening the requested file
		f, openErr := fileSystem.Open(relPath)
		if openErr != nil {
			// If not found and not under assets/, fallback to index.html (SPA routing)
			if !strings.HasPrefix(relPath, "assets/") {
				r.URL.Path = "/"
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				fileServer.ServeHTTP(w, r)
				return
			}
			http.NotFound(w, r)
			return
		}
		_ = f.Close()

		// Set explicit MIME type
		ext := path.Ext(relPath)
		if m := mime.TypeByExtension(ext); m != "" {
			w.Header().Set("Content-Type", m)
		}

		fileServer.ServeHTTP(w, r)
	})

	listener, port, err := findAvailablePort(*portFlag)
	if err != nil {
		pauseOnError(fmt.Errorf("failed to bind to network port: %w", err))
		os.Exit(1)
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	fmt.Printf("[INFO] Serving from: %s\n", sourceDesc)
	fmt.Printf("[INFO] Chunkie is ready at: %s\n", url)
	if !*noBrowserFlag {
		fmt.Println("[INFO] Opening default browser...")
		go openBrowser(url)
	}
	fmt.Println("\nPress Ctrl+C to stop the application.")

	server := &http.Server{
		Handler: handler,
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Println("\n[INFO] Shutting down Chunkie...")
		_ = server.Close()
		os.Exit(0)
	}()

	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		pauseOnError(err)
	}
}
