$(document).ready(function(){
    $('.delete-product').on('click', function(e){
        if (confirm('Are you sure you want to delete this product?')){
            $target = $(e.target);
            const asin = $target.attr('data-id');
            $.ajax({
                type: 'DELETE',
                url: '/product/'+asin,
                success: function(response){
                    window.location.href='/';
                },
                error: function(err){
                    console.log(err);
                }
            });
        };
    });
    $('.check-price').on('click', function(){
        alert("Updating....");
        $.ajax({
            type: 'GET',
            url: '/products/checkprice',
            success: function(response){
                alert(response);
                window.location.href='/';
            },
            error: function(err){
                console.log(err);
            }
        });
    });

    $('.check-promo').on('click', function(){
        alert("Checking Promo Code");
        $.ajax({
            type: 'GET',
            url: '/products/checkpromo',
            success: function(response){
                window.location.href='/';
            },
            error: function(err){
                console.log(err);
            }
        });
    });
});


