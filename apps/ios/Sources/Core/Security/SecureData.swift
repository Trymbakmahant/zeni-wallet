import Foundation

/// In-memory secure byte buffer that zeroes memory on deallocation
public final class SecureData {
    private var buffer: ContiguousArray<UInt8>

    public init(_ data: Data) {
        self.buffer = ContiguousArray(data)
    }

    public var data: Data {
        return Data(buffer)
    }

    public var count: Int {
        return buffer.count
    }

    deinit {
        // Explicitly wipe raw memory with zeros to prevent memory scraping
        buffer.withUnsafeMutableBufferPointer { pointer in
            guard let base = pointer.baseAddress else { return }
            memset(base, 0, pointer.count)
        }
    }
}
