/* Complete SOURCE sidecar DATA capture from the ORIGINAL inherited directory
 * descriptor 3. No pathname root, caller program, network, writes or model API.
 * No bytes are emitted until every retained FD/name/enumeration is rechecked. */
#ifdef __APPLE__
#define _DARWIN_C_SOURCE 1
#endif
#define _POSIX_C_SOURCE 200809L
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <dirent.h>
#include <unistd.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

#ifndef O_NOFOLLOW
#error O_NOFOLLOW is required
#endif
#ifndef O_NONBLOCK
#error O_NONBLOCK is required
#endif
#ifndef O_DIRECTORY
#error O_DIRECTORY is required
#endif
#ifndef AT_SYMLINK_NOFOLLOW
#error AT_SYMLINK_NOFOLLOW is required
#endif

#define MAX_FILES 1000u
#define MAX_DIRS 1000u
#define MAX_NAMES 10000u
#define MAX_DEPTH 24u
#define MAX_BYTES (64u * 1024u * 1024u)
#define MAX_PATH_BYTES 4096u
enum { CHANGED=71, LINKED=72, CAPACITY=73, INPUT=74, IO_FAILURE=75 };
struct names { char **items; size_t count; };
struct directory { int fd; struct stat initial; struct names entries; };
struct file { int fd; int parent; char *name; char *path; struct stat initial; unsigned char *body; size_t bytes; };
static struct directory dirs[MAX_DIRS];
static struct file files[MAX_FILES];
static size_t dir_count=0, file_count=0, total_bytes=0;

static void fail(int code) { (void)fprintf(stderr,"origin-sidecar-capture:%d\n",code); exit(code); }
static void require(int yes,int code) { if(!yes) fail(code); }
static int equal_stat(const struct stat *a,const struct stat *b) {
  if(a->st_dev!=b->st_dev || a->st_ino!=b->st_ino || a->st_mode!=b->st_mode || a->st_uid!=b->st_uid || a->st_gid!=b->st_gid || a->st_nlink!=b->st_nlink || a->st_size!=b->st_size) return 0;
#ifdef __APPLE__
  return a->st_mtimespec.tv_sec==b->st_mtimespec.tv_sec && a->st_mtimespec.tv_nsec==b->st_mtimespec.tv_nsec && a->st_ctimespec.tv_sec==b->st_ctimespec.tv_sec && a->st_ctimespec.tv_nsec==b->st_ctimespec.tv_nsec;
#else
  return a->st_mtim.tv_sec==b->st_mtim.tv_sec && a->st_mtim.tv_nsec==b->st_mtim.tv_nsec && a->st_ctim.tv_sec==b->st_ctim.tv_sec && a->st_ctim.tv_nsec==b->st_ctim.tv_nsec;
#endif
}
static char *copy_text(const char *s) { size_t n=strlen(s); char *p=malloc(n+1); require(p!=NULL,CAPACITY); memcpy(p,s,n+1); return p; }
static int compare_names(const void *a,const void *b) { return strcmp(*(char *const *)a,*(char *const *)b); }
static void check_dir(size_t index) { struct stat now; require(fstat(dirs[index].fd,&now)==0,IO_FAILURE); require(S_ISDIR(now.st_mode)&&equal_stat(&dirs[index].initial,&now),CHANGED); }
static struct names list_names(size_t index) {
  check_dir(index); int duplicate=dup(dirs[index].fd); require(duplicate>=0,IO_FAILURE);
  DIR *handle=fdopendir(duplicate); if(handle==NULL) { close(duplicate); fail(IO_FAILURE); }
  rewinddir(handle); size_t capacity=16; struct names result={calloc(capacity,sizeof(char *)),0}; require(result.items!=NULL,CAPACITY);
  for(;;) {
    errno=0; struct dirent *entry=readdir(handle);
    if(entry==NULL) { require(errno==0,IO_FAILURE); break; }
    if(strcmp(entry->d_name,".")==0||strcmp(entry->d_name,"..")==0) continue;
    require(entry->d_name[0]!='\0'&&strchr(entry->d_name,'/')==NULL&&result.count<MAX_NAMES,CAPACITY);
    if(result.count==capacity) { capacity=capacity*2>MAX_NAMES?MAX_NAMES:capacity*2; char **next=realloc(result.items,capacity*sizeof(char *)); require(next!=NULL,CAPACITY); result.items=next; }
    result.items[result.count++]=copy_text(entry->d_name);
  }
  require(closedir(handle)==0,IO_FAILURE); check_dir(index);
  qsort(result.items,result.count,sizeof(char *),compare_names);
  for(size_t i=1;i<result.count;i++) require(strcmp(result.items[i-1],result.items[i])!=0,CHANGED);
  return result;
}
static void free_names(struct names *n) { for(size_t i=0;i<n->count;i++) free(n->items[i]); free(n->items); n->items=NULL; n->count=0; }
static int equal_names(const struct names *a,const struct names *b) { if(a->count!=b->count) return 0; for(size_t i=0;i<a->count;i++) if(strcmp(a->items[i],b->items[i])!=0) return 0; return 1; }
static char *join_path(const char *prefix,const char *name) {
  size_t a=strlen(prefix),b=strlen(name); require(a+b+(a?1u:0u)<=MAX_PATH_BYTES,CAPACITY);
  char *p=malloc(a+b+2); require(p!=NULL,CAPACITY); if(a) { memcpy(p,prefix,a); p[a++]='/'; } memcpy(p+a,name,b+1); return p;
}
static size_t retain_dir(int fd,const struct stat *initial) {
  require(dir_count<MAX_DIRS,CAPACITY); size_t index=dir_count++; dirs[index].fd=fd; dirs[index].initial=*initial; dirs[index].entries=list_names(index); return index;
}
static void retain_file(size_t parent,const char *name,char *relative,const struct stat *initial) {
  require(file_count<MAX_FILES&&initial->st_size>=0&&(uintmax_t)initial->st_size<=MAX_BYTES-total_bytes,CAPACITY);
  check_dir(parent); int fd=openat(dirs[parent].fd,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC); require(fd>=0,IO_FAILURE);
  struct stat opened; require(fstat(fd,&opened)==0,IO_FAILURE); require(S_ISREG(opened.st_mode)&&opened.st_nlink==1&&equal_stat(initial,&opened),CHANGED);
  size_t size=(size_t)initial->st_size,offset=0; unsigned char *body=malloc(size+1); require(body!=NULL,CAPACITY);
  while(offset<size+1) { ssize_t n=read(fd,body+offset,size+1-offset); if(n<0&&errno==EINTR) continue; require(n>=0,IO_FAILURE); if(n==0) break; offset+=(size_t)n; }
  struct stat held,named; require(fstat(fd,&held)==0&&fstatat(dirs[parent].fd,name,&named,AT_SYMLINK_NOFOLLOW)==0,IO_FAILURE);
  require(offset==size&&equal_stat(initial,&held)&&equal_stat(initial,&named),CHANGED); check_dir(parent);
  files[file_count++]=(struct file){fd,(int)parent,copy_text(name),relative,*initial,body,size}; total_bytes+=size;
}
static int database_file(const char *prefix,const char *name) { return prefix[0]=='\0'&&(strcmp(name,"company.sqlite")==0||strcmp(name,"company.sqlite-wal")==0||strcmp(name,"company.sqlite-shm")==0); }
static void walk(size_t parent,const char *prefix,unsigned depth) {
  require(depth<=MAX_DEPTH,CAPACITY); struct names *entries=&dirs[parent].entries;
  for(size_t i=0;i<entries->count;i++) {
    const char *name=entries->items[i]; struct stat named; check_dir(parent);
    require(fstatat(dirs[parent].fd,name,&named,AT_SYMLINK_NOFOLLOW)==0,IO_FAILURE);
    require(!S_ISLNK(named.st_mode)&&(S_ISREG(named.st_mode)||S_ISDIR(named.st_mode))&&(!S_ISREG(named.st_mode)||named.st_nlink==1),LINKED);
    if(database_file(prefix,name)) { require(S_ISREG(named.st_mode),LINKED); continue; }
    char *relative=join_path(prefix,name);
    if(S_ISDIR(named.st_mode)) {
      require(depth<MAX_DEPTH&&dir_count<MAX_DIRS,CAPACITY);
      int fd=openat(dirs[parent].fd,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC); require(fd>=0,IO_FAILURE);
      struct stat opened; require(fstat(fd,&opened)==0,IO_FAILURE); require(S_ISDIR(opened.st_mode)&&equal_stat(&named,&opened),CHANGED);
      size_t child=retain_dir(fd,&opened); walk(child,relative,depth+1); check_dir(child);
      struct stat current; require(fstatat(dirs[parent].fd,name,&current,AT_SYMLINK_NOFOLLOW)==0,IO_FAILURE); require(equal_stat(&opened,&current),CHANGED); free(relative);
    } else retain_file(parent,name,relative,&named);
    check_dir(parent);
  }
}
static void check_all(void) {
  for(size_t i=0;i<dir_count;i++) { struct names current=list_names(i); require(equal_names(&dirs[i].entries,&current),CHANGED); free_names(&current); check_dir(i); }
  for(size_t i=0;i<file_count;i++) { struct stat held,named; struct file *f=&files[i]; require(fstat(f->fd,&held)==0&&fstatat(dirs[f->parent].fd,f->name,&named,AT_SYMLINK_NOFOLLOW)==0,IO_FAILURE); require(S_ISREG(held.st_mode)&&equal_stat(&f->initial,&held)&&equal_stat(&f->initial,&named),CHANGED); }
  for(size_t i=0;i<dir_count;i++) check_dir(i);
}
static void emit(const void *p,size_t bytes) { const unsigned char *b=p; while(bytes) { ssize_t n=write(STDOUT_FILENO,b,bytes); if(n<0&&errno==EINTR) continue; require(n>0,IO_FAILURE); b+=(size_t)n; bytes-=(size_t)n; } }
static void u32(uint32_t n) { unsigned char b[4]; for(unsigned i=0;i<4;i++) b[i]=(unsigned char)(n>>(24-8*i)); emit(b,4); }
static void u64(uint64_t n) { unsigned char b[8]; for(unsigned i=0;i<8;i++) b[i]=(unsigned char)(n>>(56-8*i)); emit(b,8); }
int main(int argc,char **argv) {
  require(argc==2&&strcmp(argv[1],"origin-sidecar-capture-v1")==0,INPUT); struct stat original; require(fstat(3,&original)==0&&S_ISDIR(original.st_mode),INPUT);
  size_t root=retain_dir(3,&original); walk(root,"",0); check_all();
  emit("SOCOFS1\n",8); u32((uint32_t)file_count);
  for(size_t i=0;i<file_count;i++) { struct file *f=&files[i]; u32((uint32_t)strlen(f->path)); u64((uint64_t)f->bytes); emit(f->path,strlen(f->path)); emit(f->body,f->bytes); }
  for(size_t i=0;i<file_count;i++) { close(files[i].fd); free(files[i].name); free(files[i].path); free(files[i].body); }
  for(size_t i=0;i<dir_count;i++) { free_names(&dirs[i].entries); close(dirs[i].fd); }
  return 0;
}
