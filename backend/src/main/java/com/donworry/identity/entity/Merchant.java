package com.donworry.identity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 가맹점 — 지금은 이름 · 코드 읽기만 (가맹점 등록 · 키 관리는 P1 작업)
@Entity
@Table(name = "merchants")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Merchant {

    @Id
    @Column(name = "merchant_id")
    private Long merchantId;

    @Column(name = "merchant_code", nullable = false, length = 40)
    private String merchantCode;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;
}
