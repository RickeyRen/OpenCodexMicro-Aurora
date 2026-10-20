#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreText/CoreText.h>
#import <ImageIO/ImageIO.h>

#include <errno.h>
#include <fcntl.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

// A deliberately small, local-only compositor for the plugin's own artwork.
static const size_t CanvasSize = 196;
static const size_t MaximumInputBytes = 2 * 1024 * 1024;
static const size_t MaximumFrames = 24;

static void Report(const char *message) {
    fprintf(stderr, "task-glyph-renderer: %s\n", message);
}

static NSData *ReadBoundedFile(const char *path) {
    int descriptor = open(path, O_RDONLY | O_NOFOLLOW);
    if (descriptor < 0) return nil;
    struct stat info;
    if (fstat(descriptor, &info) != 0 || !S_ISREG(info.st_mode) ||
        info.st_size <= 0 || (uint64_t)info.st_size >= MaximumInputBytes) {
        close(descriptor);
        return nil;
    }
    size_t length = (size_t)info.st_size;
    uint8_t *bytes = malloc(length);
    if (!bytes) {
        close(descriptor);
        return nil;
    }
    size_t offset = 0;
    while (offset < length) {
        ssize_t received = read(descriptor, bytes + offset, length - offset);
        if (received < 0 && errno == EINTR) continue;
        if (received <= 0) break;
        offset += (size_t)received;
    }
    uint8_t extra;
    ssize_t remaining;
    do { remaining = read(descriptor, &extra, 1); } while (remaining < 0 && errno == EINTR);
    close(descriptor);
    if (offset != length || remaining != 0) {
        free(bytes);
        return nil;
    }
    return [NSData dataWithBytesNoCopy:bytes length:length freeWhenDone:YES];
}

static BOOL ValidateSource(CGImageSourceRef source, size_t *frameCount) {
    CFStringRef type = CGImageSourceGetType(source);
    if (!type || (!CFEqual(type, CFSTR("public.png")) &&
                  !CFEqual(type, CFSTR("com.compuserve.gif")))) return NO;
    size_t count = CGImageSourceGetCount(source);
    if (!count || count > MaximumFrames ||
        (CFEqual(type, CFSTR("public.png")) && count != 1)) return NO;
    // Check encoded dimensions before allowing ImageIO to allocate a bitmap.
    for (size_t index = 0; index < count; index++) {
        NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, index, NULL));
        if ([properties[(__bridge NSString *)kCGImagePropertyPixelWidth] unsignedLongLongValue] != CanvasSize ||
            [properties[(__bridge NSString *)kCGImagePropertyPixelHeight] unsignedLongLongValue] != CanvasSize) return NO;
    }
    *frameCount = count;
    return YES;
}

typedef struct {
    CTLineRef lines[2];
    size_t count;
    CTLineRef identifier;
    BOOL legacySingleGlyph;
} LabelArtwork;

static CTLineRef CreateTextLine(NSString *value, CGFloat size, CGFloat opacity) {
    CTFontRef font = CTFontCreateWithName(CFSTR("PingFangSC-Semibold"), size, NULL);
    if (!font) return NULL;
    CGColorRef white = CGColorCreateGenericRGB(1, 1, 1, opacity);
    NSDictionary *attributes = @{
        (__bridge NSString *)kCTFontAttributeName: (__bridge id)font,
        (__bridge NSString *)kCTForegroundColorAttributeName: (__bridge id)white
    };
    // CoreText supplies font fallback for characters absent from PingFang.
    NSAttributedString *text = [[NSAttributedString alloc] initWithString:value attributes:attributes];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)text);
    CGColorRelease(white);
    CFRelease(font);
    return line;
}

static void ReleaseLabelArtwork(LabelArtwork *artwork) {
    for (size_t index = 0; index < artwork->count; index++) {
        if (artwork->lines[index]) CFRelease(artwork->lines[index]);
    }
    if (artwork->identifier) CFRelease(artwork->identifier);
    memset(artwork, 0, sizeof(*artwork));
}

static BOOL CreateLabelArtwork(NSString *label, NSString *identifier, LabelArtwork *artwork) {
    NSArray<NSString *> *lines = label.length ? [label componentsSeparatedByString:@"\n"] : @[];
    if (lines.count > 2) return NO;
    artwork->count = lines.count;
    __block NSUInteger glyphCount = 0;
    [label enumerateSubstringsInRange:NSMakeRange(0, label.length)
                             options:NSStringEnumerationByComposedCharacterSequences
                          usingBlock:^(NSString *substring, NSRange substringRange, NSRange enclosingRange, BOOL *stop) {
        (void)substring; (void)substringRange; (void)enclosingRange; (void)stop;
        glyphCount++;
    }];
    artwork->legacySingleGlyph = !identifier.length && lines.count == 1 && glyphCount == 1;
    CGFloat fontSize = artwork->legacySingleGlyph ? 88.0 : lines.count == 2 ? 48.0 : 52.0;
    CGFloat maximumWidth = 0;
    for (size_t index = 0; index < lines.count; index++) {
        artwork->lines[index] = CreateTextLine(lines[index], fontSize, 1.0);
        if (!artwork->lines[index]) return NO;
        maximumWidth = fmax(maximumWidth, CTLineGetTypographicBounds(artwork->lines[index], NULL, NULL, NULL));
    }
    // Measure the actual CoreText advance: Latin letters, CJK and emoji all
    // receive the same 20 px side margins without clipping or horizontal scale.
    if (maximumWidth > 156.0) {
        fontSize *= 156.0 / maximumWidth;
        for (size_t index = 0; index < lines.count; index++) {
            CFRelease(artwork->lines[index]);
            artwork->lines[index] = CreateTextLine(lines[index], fontSize, 1.0);
            if (!artwork->lines[index]) return NO;
        }
    }
    if (identifier.length) {
        artwork->identifier = CreateTextLine(identifier, 24.0, 0.78);
        if (!artwork->identifier) return NO;
        double width = CTLineGetTypographicBounds(artwork->identifier, NULL, NULL, NULL);
        if (width > 48.0) {
            CFRelease(artwork->identifier);
            artwork->identifier = CreateTextLine(identifier, 24.0 * 48.0 / width, 0.78);
            if (!artwork->identifier) return NO;
        }
    }
    return YES;
}

static CGRect VisibleLineBounds(CTLineRef line, CGContextRef context) {
    CGContextSetTextPosition(context, 0, 0);
    return CTLineGetImageBounds(line, context);
}

static BOOL ValidTextBounds(CGRect bounds) {
    return !CGRectIsNull(bounds) && !CGRectIsEmpty(bounds) &&
        isfinite(bounds.origin.x) && isfinite(bounds.origin.y) &&
        isfinite(bounds.size.width) && isfinite(bounds.size.height);
}

static CGImageRef CreateCompositedFrame(CGImageSourceRef source, size_t index, const LabelArtwork *artwork) {
    NSDictionary *decodeOptions = @{(__bridge NSString *)kCGImageSourceShouldCache: @NO};
    CGImageRef background = CGImageSourceCreateImageAtIndex(source, index, (__bridge CFDictionaryRef)decodeOptions);
    if (!background) return NULL;
    // ImageIO expands optimized GIF rectangles into complete canvas frames.
    if (CGImageGetWidth(background) != CanvasSize || CGImageGetHeight(background) != CanvasSize) {
        CGImageRelease(background);
        return NULL;
    }
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(NULL, CanvasSize, CanvasSize, 8, CanvasSize * 4,
                                                colorSpace, kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(colorSpace);
    if (!context) {
        CGImageRelease(background);
        return NULL;
    }
    CGContextDrawImage(context, CGRectMake(0, 0, CanvasSize, CanvasSize), background);
    CGImageRelease(background);
    CGContextSetAllowsAntialiasing(context, true);
    CGContextSetShouldAntialias(context, true);
    CGContextSetTextMatrix(context, CGAffineTransformIdentity);
    for (size_t lineIndex = 0; lineIndex < artwork->count; lineIndex++) {
        CTLineRef line = artwork->lines[lineIndex];
        CGRect bounds = VisibleLineBounds(line, context);
        if (!ValidTextBounds(bounds)) {
            CGContextRelease(context);
            return NULL;
        }
        // Compact labels sit slightly below center, leaving room for the quiet
        // identifier above. Two lines stay centered as one readable text block.
        CGFloat centerY = artwork->legacySingleGlyph ? 98.0 : 84.0;
        if (artwork->count == 2) centerY += lineIndex == 0 ? 27.0 : -27.0;
        CGContextSetTextPosition(context,
            (CanvasSize - bounds.size.width) / 2.0 - bounds.origin.x,
            centerY - bounds.size.height / 2.0 - bounds.origin.y);
        CTLineDraw(line, context);
    }
    if (artwork->identifier) {
        CGRect bounds = VisibleLineBounds(artwork->identifier, context);
        if (!ValidTextBounds(bounds)) {
            CGContextRelease(context);
            return NULL;
        }
        CGContextSetTextPosition(context, 20.0 - bounds.origin.x,
            CanvasSize - 22.0 - bounds.size.height - bounds.origin.y);
        CTLineDraw(artwork->identifier, context);
    }
    CGImageRef result = CGBitmapContextCreateImage(context);
    CGContextRelease(context);
    return result;
}

static BOOL ValidDelay(id delay) {
    return [delay isKindOfClass:[NSNumber class]] && isfinite([delay doubleValue]) && [delay doubleValue] > 0;
}

static BOOL WriteCompositedImage(CGImageSourceRef source, size_t frameCount, const LabelArtwork *artwork, NSURL *outputURL) {
    CFStringRef type = CGImageSourceGetType(source);
    BOOL animatedFormat = CFEqual(type, CFSTR("com.compuserve.gif"));
    // The input format determines encoding; cache output names may end in .tmp.
    CGImageDestinationRef destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)outputURL, type, frameCount, NULL);
    if (!destination) return NO;
    if (animatedFormat) {
        NSDictionary *sourceProperties = CFBridgingRelease(CGImageSourceCopyProperties(source, NULL));
        NSMutableDictionary *gif = [sourceProperties[(__bridge NSString *)kCGImagePropertyGIFDictionary] mutableCopy];
        if (!gif) gif = [NSMutableDictionary dictionary];
        if (!gif[(__bridge NSString *)kCGImagePropertyGIFLoopCount]) gif[(__bridge NSString *)kCGImagePropertyGIFLoopCount] = @0;
        NSDictionary *properties = @{(__bridge NSString *)kCGImagePropertyGIFDictionary: gif};
        CGImageDestinationSetProperties(destination, (__bridge CFDictionaryRef)properties);
    }
    BOOL success = YES;
    for (size_t index = 0; index < frameCount; index++) {
        @autoreleasepool {
            CGImageRef frame = CreateCompositedFrame(source, index, artwork);
            if (!frame) {
                success = NO;
            } else {
                NSDictionary *sourceProperties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, index, NULL));
                NSMutableDictionary *properties = [sourceProperties mutableCopy];
                if (!properties) properties = [NSMutableDictionary dictionary];
                if (animatedFormat) {
                    NSMutableDictionary *gif = [properties[(__bridge NSString *)kCGImagePropertyGIFDictionary] mutableCopy];
                    if (!gif) gif = [NSMutableDictionary dictionary];
                    NSString *delayKey = (__bridge NSString *)kCGImagePropertyGIFDelayTime;
                    NSString *unclampedKey = (__bridge NSString *)kCGImagePropertyGIFUnclampedDelayTime;
                    NSNumber *delay = ValidDelay(gif[unclampedKey]) ? gif[unclampedKey] :
                                      ValidDelay(gif[delayKey]) ? gif[delayKey] : @0.08;
                    if (!ValidDelay(gif[delayKey])) gif[delayKey] = delay;
                    if (!ValidDelay(gif[unclampedKey])) gif[unclampedKey] = delay;
                    properties[(__bridge NSString *)kCGImagePropertyGIFDictionary] = gif;
                }
                CGImageDestinationAddImage(destination, frame, (__bridge CFDictionaryRef)properties);
                CGImageRelease(frame);
            }
        }
        if (!success) break;
    }
    if (success) success = CGImageDestinationFinalize(destination);
    CFRelease(destination);
    return success;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 4 && argc != 5) {
            Report("expected input, output, label, optional conversation number");
            return 64;
        }
        size_t labelBytes = strlen(argv[3]);
        NSString *label = labelBytes <= 256 ? [NSString stringWithUTF8String:argv[3]] : nil;
        NSString *identifier = argc == 5 ? [NSString stringWithUTF8String:argv[4]] : @"";
        NSCharacterSet *digits = [NSCharacterSet characterSetWithCharactersInString:@"0123456789"];
        BOOL validIdentifier = identifier && identifier.length <= 4 &&
            [identifier rangeOfCharacterFromSet:[digits invertedSet]].location == NSNotFound &&
            identifier.integerValue <= 4096;
        NSString *outputPath = [NSString stringWithUTF8String:argv[2]];
        if (!label || !validIdentifier || !outputPath || !strcmp(argv[1], argv[2])) {
            Report("invalid arguments");
            return 65;
        }
        NSData *encoded = ReadBoundedFile(argv[1]);
        if (!encoded) {
            Report("invalid input file");
            return 66;
        }
        NSDictionary *options = @{(__bridge NSString *)kCGImageSourceShouldCache: @NO};
        CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)encoded, (__bridge CFDictionaryRef)options);
        size_t frameCount = 0;
        if (!source || !ValidateSource(source, &frameCount)) {
            if (source) CFRelease(source);
            Report("unsupported image");
            return 65;
        }
        LabelArtwork artwork = {0};
        if (!CreateLabelArtwork(label, identifier, &artwork)) {
            ReleaseLabelArtwork(&artwork);
            CFRelease(source);
            Report("unsupported label or unavailable font");
            return 70;
        }
        // Publish only a complete file; never leave a partly encoded cache hit.
        NSString *temporaryTemplate = [outputPath stringByAppendingString:@".render-XXXXXX"];
        char *temporaryPath = strdup([temporaryTemplate fileSystemRepresentation]);
        int temporaryDescriptor = temporaryPath ? mkstemp(temporaryPath) : -1;
        if (temporaryDescriptor < 0) {
            free(temporaryPath);
            ReleaseLabelArtwork(&artwork);
            CFRelease(source);
            Report("output unavailable");
            return 73;
        }
        close(temporaryDescriptor);
        NSURL *temporaryURL = [NSURL fileURLWithFileSystemRepresentation:temporaryPath isDirectory:NO relativeToURL:nil];
        BOOL success = WriteCompositedImage(source, frameCount, &artwork, temporaryURL);
        ReleaseLabelArtwork(&artwork);
        CFRelease(source);
        if (success) success = rename(temporaryPath, [outputPath fileSystemRepresentation]) == 0;
        if (!success) unlink(temporaryPath);
        free(temporaryPath);
        if (!success) {
            Report("render failed");
            return 74;
        }
        return 0;
    }
}
