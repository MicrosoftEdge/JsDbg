int global_var = 42;

typedef int* IntPointer;
IntPointer ip;

class Base {
  int base_member_;
};

class Class : public Base {
  struct {
    int member_;
  };
};

enum class Enum {
  EFirst = 1
};

int main() {
  Class c;
  Enum e;
  return global_var;
}
