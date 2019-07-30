class SFieldResult(object):
    def __init__(self, offset, size, bitOffset, bitCount, fieldName, typeName):
        self.offset = offset
        self.size = size
        self.bitOffset = bitOffset
        self.bitCount = bitCount
        self.fieldName = fieldName
        self.typeName = typeName

    def __repr__(self):
        return '{%d#%d#%d#%d#%s#%s}' % (self.offset, self.size, self.bitOffset, self.bitCount, self.fieldName, self.typeName)

class SBaseTypeResult(object):
    def __init__(self, module, typeName, offset):
        self.module = module
        self.typeName = typeName
        self.offset = offset

    def __repr__(self):
        return '{%s#%s#%d}' % (self.module, self.typeName, self.offset)

class SSymbolResult(object):
    def __init__(self, type, pointer):
        self.type = type
        self.pointer = pointer

    def __repr__(self):
        return '{%s#%d}' % (self.type, self.pointer)

class SStackFrame(object):
    def __init__(self, pc, sp, fp):
        self.instructionAddress = pc
        self.stackAddress = sp
        self.frameAddress = fp

    def __repr__(self):
        return '{%d#%d#%d}' % (self.instructionAddress, self.stackAddress, self.frameAddress)


class SNamedSymbol(object):
    def __init__(self, module, name, symbolResult):
        self.module = module
        self.name = name
        self.symbolResult = symbolResult

    def __repr__(self):
        return '{%s#%s#%d#%s}' % (
            self.module, self.name, self.symbolResult.pointer,
            self.symbolResult.type)


class SConstantResult(object):
    def __init__(self, name, value):
        self.name = name
        self.value = value

    def __repr__(self):
        return '{%s#%d}' % (self.name, self.value)


class SModule(object):
    def __init__(self, name, baseAddress):
        self.name = name
        self.baseAddress = baseAddress

    def __repr__(self):
        return '{%s#%d}' % (self.name, self.baseAddress)
