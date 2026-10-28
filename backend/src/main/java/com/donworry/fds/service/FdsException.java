package com.donworry.fds.service;

import lombok.Getter;

@Getter
public class FdsException extends RuntimeException {

    private final FdsErrorCode errorCode;

    public FdsException(FdsErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }
}
