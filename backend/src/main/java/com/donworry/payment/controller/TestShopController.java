package com.donworry.payment.controller;

import com.donworry.payment.dto.CheckoutDtos.TestOrderRequest;
import com.donworry.payment.dto.CheckoutDtos.TestOrderResponse;
import com.donworry.payment.dto.CheckoutDtos.TestProductResponse;
import com.donworry.payment.service.TestShop;
import com.donworry.payment.service.TestShopService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 시연용 테스트 상점 (#82) — CakeShop 없이 결제 흐름을 볼 때. 운영 프로필에서 끄는 건 배포 설정 작업에서
@RestController
@RequestMapping("/api/demo/test-shop")
@RequiredArgsConstructor
public class TestShopController {

    private final TestShopService testShopService;

    @GetMapping("/products")
    public List<TestProductResponse> products() {
        return TestShop.PRODUCTS.stream()
                .map(p -> new TestProductResponse(p.productId(), p.title(), p.amount(), p.note()))
                .toList();
    }

    @PostMapping("/orders")
    public TestOrderResponse order(@RequestBody TestOrderRequest request) {
        return new TestOrderResponse(testShopService.order(request.productId(), request.buyer(), request.guestKey()));
    }
}
